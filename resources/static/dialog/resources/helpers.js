/*jshint browsers:true, forin: true, laxbreak: true */
/*global BrowserID: true*/
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
(function() {
  "use strict";

  var bid = BrowserID,
      helpers = bid.Helpers,
      user = bid.User,
      tooltip = bid.Tooltip,
      errors = bid.Errors;

  function complete(callback, status) {
    callback && callback(status);
  }

  function animateClose(callback) {
    var body = $("body"),
        doAnimation = $("#signIn").length && body.innerWidth() > 640;

    if (doAnimation) {
      $("#signIn").animate({"width" : "95%"}, 750, function () {
         body.delay(500).animate({ "opacity" : "0.5"}, 500);
      });

      // Call setTimeout here because on Android default browser, sometimes the
      // callback is not correctly called, it seems as if jQuery does not know
      // the animation is complete.
      setTimeout(complete.curry(callback), 1750);
    }
    else {
      complete(callback);
    }
  }

  function getAssertion(email, callback) {
    var self=this;
    var wait = bid.Screens.wait;
    wait.show("wait", bid.Wait.generateKey);
    user.getAssertion(email, user.getOrigin(), function(assert) {
      assert = assert || null;
      wait.hide();
      animateClose(function() {
        self.close("assertion_generated", {
          assertion: assert
        });

        complete(callback, assert);
      });
    }, self.getErrorDialog(errors.getAssertion, complete));
  }

  function authenticateUser(email, pass, callback) {
    var self=this;
    user.authenticate(email, pass,
      function (authenticated) {
        if (!authenticated) {
          tooltip.showTooltip("#cannot_authenticate");
        }
        complete(callback, authenticated);
      }, self.getErrorDialog(errors.authenticate, callback));
  }

  function createUser(email, callback) {
    var self=this;
    user.createSecondaryUser(email, function(status) {
      if (status) {
        self.close("user_staged", {
          email: email
        });
        complete(callback, true);
      }
      else {
        tooltip.showTooltip("#could_not_add");
        complete(callback, false);
      }
    }, self.getErrorDialog(errors.createUser, callback));
  }

  function resetPassword(email, callback) {
    var self=this;
    user.requestPasswordReset(email, function(status) {
      if (status.success) {
        self.close("reset_password", {
          email: email
        });
      }
      else {
        tooltip.showTooltip("#could_not_add");
      }
      complete(callback, status.success);
    }, self.getErrorDialog(errors.requestPasswordReset, callback));
  }

  function addEmail(email, callback) {
    var self=this;

    if (user.getStoredEmailKeypair(email)) {
      // User already owns this address
      tooltip.showTooltip("#already_own_address");
      complete(callback, false);
    }
    else {
      user.addressInfo(email, function(info) {
        if (info.type === "primary") {
          self.close("primary_user", _.extend(info, { email: email, add: true }));
          complete(callback, true);
        }
        else {
          user.addEmail(email, function(added) {
            if (added) {
              self.close("email_staged", {
                email: email
              });
            }
            else {
              tooltip.showTooltip("#could_not_add");
            }
            complete(callback, added);
          }, self.getErrorDialog(errors.addEmail, callback));
        }
      }, self.getErrorDialog(errors.addressInfo, callback));
    }
  }

  function cancelEvent(callback) {
    return function(event) {
      event && event.preventDefault();
      callback.call(this);
    };
  }

  helpers.Dialog = helpers.Dialog || {};

  helpers.extend(helpers.Dialog, {
    getAssertion: getAssertion,
    authenticateUser: authenticateUser,
    createUser: createUser,
    addEmail: addEmail,
    resetPassword: resetPassword,
    cancelEvent: cancelEvent
  });

}());
