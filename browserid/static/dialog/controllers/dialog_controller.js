/*jshint brgwser:true, jQuery: true, forin: true, laxbreak:true */                                             
/*global Channel:true, CryptoStubs:true, alert:true, errorOut:true, setupChannel:true, getEmails:true, clearEmails: true, console: true, _: true, pollTimeout: true, addEmail: true, removeEmail:true, BrowserIDNetwork: true, BrowserIDWait:true, BrowserIDErrors: true, PageController: true, OpenAjax: true */ 
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla BrowserID.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

//
// a JMVC controller for the browserid dialog
//

(function() {
"use strict";

PageController.extend("Dialog", {}, {
    init: function(el) {
      var html = $.View("//dialog/views/body.ejs", {});
      this.element.html(html);
      this.element.show();

      // keep track of where we are and what we do on success and error
      this.onsuccess = null;
      this.onerror = null;
      var chan = setupChannel(this);
      this.stateMachine();
    },
      
    getVerifiedEmail: function(origin_url, onsuccess, onerror) {
      this.onsuccess = onsuccess;
      this.onerror = onerror;

      BrowserIDNetwork.setOrigin(origin_url);

      this.doStart();

      var self=this;
      $(window).bind("unload", function() {
        self.doCancel();
      });
    },


    stateMachine: function() {
      var self=this, hub = OpenAjax.hub, el = this.element;

      hub.subscribe("createaccount:created", function(msg, info) {
        self.doConfirmEmail(info.email, info.keypair);
      });

      hub.subscribe("createaccount:signin", function() {
        self.doAuthenticate();
      });

      hub.subscribe("authenticate:authenticated", function() {
        self.syncIdentities();
      });

      hub.subscribe("authenticate:createuser", function() {
        self.doCreate();
      });

      hub.subscribe("authenticate:forgotpassword", function() {
        self.doForgotPassword();
      });

      hub.subscribe("checkregistration:confirmed", function() {
        self.doRegistrationConfirmed();
      });

      hub.subscribe("checkregistration:complete", function() {
        self.doSignIn();
      });

      hub.subscribe("chooseemail:complete", function(msg, info) {
        self.doEmailSelected(info.email);
      });

      hub.subscribe("chooseemail:addemail", function() {
        self.doAddEmail();
      });

      hub.subscribe("chooseemail:notme", function() {
        self.doNotMe();
      });

      hub.subscribe("addemail:complete", function(msg, info) {
        self.doConfirmEmail(info.email, info.keypair);
      });

      hub.subscribe("start", function() {
        self.doStart();
      });

      hub.subscribe("cancel", function() {
        self.doCancel();
      });

    },

    doStart: function() {
      // we should always check to see whether we're authenticated
      // at dialog start. issue #74.
      //
      // (lth) XXX: we could include both csrf token and auth status
      // in the intial resource serving to reduce network requests.
      this.doCheckAuth();
    },
      
    doCancel: function() {
      var self=this;
      if(self.onsuccess) {
        self.onsuccess(null);
      }
    },

    doSignIn: function() {
      this.element.chooseemail();
    },

    doAuthenticate: function() {
      this.element.authenticate();
    },
      
    doCreate: function() {
      this.element.createaccount();
    },
      
    doForgotPassword: function() {
      this.element.forgotpassword();
    },

    doAddEmail: function() {
      this.element.addemail();
    },

    doConfirmEmail: function(email, keypair) {
      this.confirmEmail = email;
      this.confirmKeypair = keypair;

      this.element.checkregistration({email: email});
    },

    doRegistrationConfirmed: function() {
        var self = this;
        // this is a secondary registration from browserid.org, persist
        // email, keypair, and that fact
        self.persistAddressAndKeyPair(self.confirmEmail, 
          self.confirmKeypair, "browserid.org:443");
        self.syncIdentities();

    },

    doEmailSelected: function(email) {
      var self=this,
          // yay!  now we need to produce an assertion.
          storedID = getEmails()[email],
          privkey = storedID.priv,
          issuer = storedID.issuer,
          audience = BrowserIDNetwork.origin,
          assertion = CryptoStubs.createAssertion(audience, email, privkey, issuer);

      // Clear onerror before the call to onsuccess - the code to onsuccess 
      // calls window.close, which would trigger the onerror callback if we 
      // tried this afterwards.
      self.onerror = null;
      self.onsuccess(assertion);
    },

    doNotMe: function() {
      clearEmails();
      BrowserIDNetwork.logout(this.doAuthenticate.bind(this));
    },

    persistAddressAndKeyPair: function(email, keypair, issuer) {
      var new_email_obj= {
        created: new Date(),
        pub: keypair.pub,
        priv: keypair.priv
      };
      if (issuer) {
        new_email_obj.issuer = issuer;
      }
      
      addEmail(email, new_email_obj);
    },

    syncIdentities: function() {
      // send up all email/pubkey pairs to the server, it will response with a
      // list of emails that need new keys.  This may include emails in the
      // sent list, and also may include identities registered on other devices.
      // we'll go through the list and generate new keypairs
      
      // identities that don't have an issuer are primary authentications,
      // and we don't need to worry about rekeying them.
      var emails = getEmails();
      var issued_identities = {};
      _(emails).each(function(email_obj, email_address) {
          issued_identities[email_address] = email_obj.pub;
        });
      
      var self = this;
      BrowserIDNetwork.syncEmails(issued_identities, 
        function onKeySyncSuccess(email, keypair) {
          self.persistAddressAndKeyPair(email, keypair, "browserid.org:443");
        },
        function onKeySyncFailure() {
          self.runErrorDialog(BrowserIDErrors.syncAddress);
        },
        function onSuccess() {
          self.doSignIn();
        }, self.getErrorDialog(BrowserIDErrors.signIn)
      );

    },


    doCheckAuth: function() {
      this.doWait(BrowserIDWait.checkAuth);
      var self=this;
      BrowserIDNetwork.checkAuth(function(authenticated) {
        if (authenticated) {
          self.syncIdentities();
        } else {
          self.doAuthenticate();
        }
      }, function() {
        self.runErrorDialog(BrowserIDErrors.checkAuthentication);
      });
  }

  });


}());
