/*jshint brgwser:true, jQuery: true, forin: true, laxbreak:true */                                             
/*global Channel:true, CryptoStubs:true, alert:true, errorOut:true, setupChannel:true, getEmails:true, clearEmails: true, console: true, _: true, pollTimeout: true, addEmail: true, removeEmail:true, BrowserIDNetwork: true, BrowserIDWait:true, BrowserIDErrors: true, PageController: true */ 
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
(function() {
  "use strict";

  PageController.extend("Checkregistration", {}, {
    init: function(options) {
      this._super({
        bodyTemplate: "confirmemail.ejs",
        bodyVars: {
          email: options.email
        },
        footerTemplate: "bottom-confirmemail.ejs",
        footerVars: {}
      });
      $('#continue_button').addClass('disabled');
      this.setupRegCheck();
    },

    close: function() {
      if(this.pollTimeout) {
        clearTimeout(this.pollTimeout);
        this.pollTimeout = null;
      }

      this._super.apply(this, arguments);
    },

    setupRegCheck: function() {
      // now poll every 3s waiting for the user to complete confirmation
      var self=this;
      function setupRegCheck() {
        self.pollTimeout = setTimeout(function() {
          BrowserIDNetwork.checkRegistration(function(status) {
            // registration status checks the status of the last initiated registration,
            // it's possible return values are:
            //   'complete' - registration has been completed
            //   'pending'  - a registration is in progress
            //   'noRegistration' - no registration is in progress
            if (status === 'complete') {
              // and tell the user that everything is really quite awesome.
              self.find("#waiting_confirmation").hide();
              self.find("#resendit_action").hide();
              self.find("#confirmed_notice").show();

              // enable button
              $('#continue_button').removeClass('disabled');

              self.publish("checkregistration:confirmed");
            } else if (status === 'pending') {
              // try again, what else can we do?
              self.setupRegCheck();
            } else {
              self.runErrorDialog(BrowserIDErrors.registration);
            }
          }, self.getErrorDialog(BrowserIDErrors.registration));
        }, 3000);
      }
      
      // setup the timeout
      setupRegCheck();

    },

    validate: function() {
      var valid = !$("#continue_button").hasClass("disabled");
      return valid;
    },

    submit: function() {
      var self=this;
      self.publish("checkregistration:complete");
      self._super();      
    }

  });



}());
