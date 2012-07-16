/*jshint browser:true, jquery: true, forin: false, laxbreak:true */
/*global _: true, BrowserID: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Modules.VerifyPrimaryUser = (function() {
  "use strict";

  var bid = BrowserID,
      user = bid.User,
      errors = bid.Errors,
      wait = bid.Wait,
      sc,
      win,
      add,
      email,
      addressInfo,
      helpers = bid.Helpers,
      dialogHelpers = helpers.Dialog,
      complete = helpers.complete,
      delayScreenTimeout,
      proxyIdP = bid.ProxyIdP;

  function verify(callback) {
    /*jshint validthis: true */
    var self = this,
        url = helpers.toURL(addressInfo.auth, {email: email});

    // primary_user_authenticating must be published before the wait
    // screen is rendered or else the wait screen is taken away when all the
    // modules are stopped.
    self.publish("primary_user_authenticating", { url: url });
    self.renderWait("wait", wait.redirectToIdP);

    // Use the setTimeout delay so the wait screen actually renders.  If the
    // document's location is redirected before the screen is displayed, the
    // user never sees it and it looks pretty ugly.
    setTimeout(function() {
      // BigTent IdPs sometimes have odd sizes.  Resize to take care of them.
      var authWindowSize = proxyIdP.authWindowSize(addressInfo.auth, email);
      if (authWindowSize) {
        win.resizeTo(authWindowSize.w, authWindowSize.h);
      }

      // Save a bit of state for when the user returns from the IdP
      // authentication flow.  Used in dialog.js to re-start the dialog at the
      // correct state.
      win.sessionStorage.primaryVerificationFlow = JSON.stringify({
        add: add,
        email: email
      });

      win.document.location = url;

      complete(callback);
    }, delayScreenTimeout);
  }

  function cancel(callback) {
    /*jshint validthis: true */
    this.close("cancel_state");
    complete(callback);
  }

  var Module = bid.Modules.PageModule.extend({
    start: function(options) {
      var self=this;
      options = options || {};

      win = options.window || window;
      add = options.add;
      email = options.email;
      delayScreenTimeout = typeof options.delay_screen_timeout === "number" ? options.delay_screen_timeout : 500;

      sc.start.call(self, options);

      user.addressInfo(email, function(info) {
        addressInfo = info;

        // immediately call verify if the user is being shuffled off to a proxy
        // idp.  This skips the verification screen that normal IdP users see.
        // Inconsistent - yet.  Perhaps we will change this universally.
        if (proxyIdP.isProxyIdP(addressInfo.auth)) {
          verify.call(self, options.ready);
        }
        else {
          var templateData = _.extend({}, options, {
            auth_url: addressInfo.auth || null,
            personaTOSPP: options.personaTOSPP,
            siteName: options.siteName,
            idpName: options.idpName
          });
          self.renderDialog("verify_primary_user", templateData);

          if (options.siteTOSPP) {
            dialogHelpers.showRPTosPP.call(self);
          }

          self.click("#cancel", cancel);
          complete(options.ready);
        }
      }, self.getErrorDialog(errors.addressInfo));
    },

    submit: verify

    // BEGIN TESTING API
    ,
    cancel: cancel
    // END TESTING API
  });

  sc = Module.sc;

  return Module;
}());

