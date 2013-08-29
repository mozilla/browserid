/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
(function() {
  "use strict";

  var controller,
      el = $("body"),
      bid = BrowserID,
      testHelpers = bid.TestHelpers,
      testElementExists = testHelpers.testElementExists,
      testElementNotExists = testHelpers.testElementDoesNotExist,
      testElementTextContains = testHelpers.testElementTextContains,
      testTooltipVisible = testHelpers.testTooltipVisible,
      CANCEL_SELECTOR = "#cancel",
      register = testHelpers.register;

  function createController(options) {
    controller = bid.Modules.SetPassword.create();
    controller.start(options);
  }

  module("dialog/js/modules/set_password", {
    setup: function() {
      testHelpers.setup();
      createController();
    },

    teardown: function() {
      controller.destroy();
      testHelpers.teardown();
    }
  });


  test("create with no options - show template, user must verify email, can cancel", function() {
    ok($("#set_password").length, "set_password template added");
    testElementExists("#verify_user");
    testElementExists(CANCEL_SELECTOR);
  });

  test("create with cancelable=false option - cancel button not shown", function() {
    controller.destroy();
    createController({ cancelable: false });
    testElementNotExists(CANCEL_SELECTOR);
  });

  test("create with transition_no_password", function() {
    controller.destroy();
    createController({
      email: "transition@password.no",
      transition_no_password: true
    });
    var selector = "#set_password .inputs li";
    testElementTextContains(selector, "no longer allows", "transition message shown");
    testElementTextContains(selector, "password.no", "message shows IdP domain");
  });

  asyncTest("submit in password field with good password - skip to vpassword field", function() {
    $("#password").val("password");
    $("#vpassword").val("");
    // IE8 is difficult. To programatically focus a new element, sometimes it
    // is necessary to blur the old element.
    $(":focus").blur();
    $("#password").focus();

    controller.submit(function() {
      testHelpers.testElementFocused("#vpassword");
      start();
    });
  });

  asyncTest("submit with good password/vpassword - password_set message raised", function() {
    $("#password").val("password");
    $("#vpassword").val("password");

    var password;
    register("password_set", function(msg, info) {
      password = info.password;
    });

    controller.submit(function() {
      equal(password, "password", "password_set message raised with correct password");
      start();
    });
  });

  function testInvalidPasswordAndValidationPassword(password, vpassword) {
    $("#password").val(password);
    $("#vpassword").val(vpassword);
    register("password_set", function(msg, info) {
      ok(false, "password_set should not be called");
    });

    controller.submit(function() {
      // The only combination that does not show a tooltip is when there is
      // a password but not a vpassword. See issue #3502.
      // https://github.com/mozilla/browserid/issues/3502
      if (!(password && !vpassword)) {
        testTooltipVisible();
      } else {
        // Run a no-op test to satisfy QUnit requirement that tests must have
        // at least one assertion.  The real test is above; that password_set
        // should not be called.
        ok(true, "Run a no-op test to satisfy QUnit");
      }

      start();
    });
  }

  testHelpers.testInvalidPasswordAndValidationPassword("submit with", testInvalidPasswordAndValidationPassword);

  asyncTest("cancel - cancel_state message raised", function() {
    register("cancel_state", function(msg, info) {
      ok(true, "state cancelled");
      start();
    });

    $(CANCEL_SELECTOR).click();
  });
}());
