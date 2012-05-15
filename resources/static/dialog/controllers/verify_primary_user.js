/*jshint browser:true, jQuery: true, forin: false, laxbreak:true */
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
      auth_url,
      helpers = bid.Helpers,
      complete = helpers.complete,
      delayScreenTimeout,
      isProxyIdP;

  // yahoo resizes themselves
  var RESIZE_TABLE = {
    "gmail.com$": { w: 900, h: 600 },
    "hotmail.com$": { w: 700, h: 488 }
  };

  function resizeWindow(email) {
    for(var key in RESIZE_TABLE) {
      var regExp = new RegExp(key);
      if (regExp.test(email)) {
        var dimensions = RESIZE_TABLE[key];
        win.resizeTo(dimensions.w, dimensions.h);
        return;
      }
    }
  }


  function verify(callback) {
    var self = this,
        // replace any hashes that may be there already.
        returnTo = win.document.location.href.replace(/#.*$/, ""),
        type = add ? "ADD_EMAIL" : "CREATE_EMAIL",
        url = helpers.toURL(auth_url, {
          email: email,
          return_to: returnTo + "#" + type + "=" +email
        });

    // primary_user_authenticating must be published before the wait
    // screen is rendered or else the wait screen is taken away when all the
    // modules are stopped.
    self.publish("primary_user_authenticating", { url: url });
    self.renderWait("wait", wait.redirectToIdP);

    // Use the setTimeout delay so the wait screen actually renders.  If the
    // document's location is redirected before the screen is displayed, the
    // user never sees it and it looks pretty ugly.
    setTimeout(function() {
      // only resize the window if redirecting to a proxyIdP.  All other IdPs
      // should abide by our rules of 700x400 default.
      if (isProxyIdP) resizeWindow(email);
      win.document.location = url;

      complete(callback);
    }, delayScreenTimeout);
  }

  function cancel(callback) {
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

      user.addressInfo(email, function(addressInfo) {
        auth_url = addressInfo.auth;
        isProxyIdP = addressInfo.type === "proxyidp";

        // immediately call verify if the user is being shuffled off to a proxy
        // idp.  This skips the verification screen that normal IdP users see.
        // Inconsistent - yet.  Perhaps we will change this universally.
        if (isProxyIdP) {
          verify.call(self, options.ready);
        }
        else {
          var templateData = helpers.extend({}, options, {
            auth_url: addressInfo.auth || null,
            requiredEmail: options.requiredEmail || false,
            privacy_url: options.privacyURL || null,
            tos_url: options.tosURL || null
          });
          self.renderDialog("verify_primary_user", templateData);

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

