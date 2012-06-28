/*jshint browsers:true, forin: true, laxbreak: true */
/*global asyncTest: true, test: true, start: true, stop: true, module: true, ok: true, equal: true, BrowserID:true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
(function() {
  "use strict";

  var bid = BrowserID,
      controller,
      el,
      testHelpers = bid.TestHelpers,
      xhr = bid.Mocks.xhr,
      WindowMock = bid.Mocks.WindowMock,
      AUTH_URL = "https://auth_url",
      PROXY_AUTH_URL = "https://bigtent.mozilla.org/auth",
      win,
      mediator = bid.Mediator;

  function createController(config) {
    controller = BrowserID.Modules.VerifyPrimaryUser.create();

    config.delay_screen_timeout = 0;
    config.window = win;

    controller.start(config);
  }

  module("controllers/verify_primary_user", {
    setup: function() {
      testHelpers.setup();
      win = new WindowMock();
      win.document.location.href = "sign_in";
      xhr.useResult("primary");
    },

    teardown: function() {
      if(controller) {
        controller.destroy();
      }
      testHelpers.teardown();
    }
  });

  asyncTest("create with privacyURL and tosURL defined - show TOS/PP", function() {
    createController({
      add: false,
      email: "unregistered@testuser.com",
      privacyURL: "http://testuser.com/priv.html",
      tosURL: "http://testuser.com/tos.html",
      ready: function() {
        equal($(".tospp").length, 1, "tospp has been added to the DOM");
        start();
      }
    });
  });

  asyncTest("create with requiredEmail, privacyURL and tosURL defined - show TOS/PP", function() {
    createController({
      add: false,
      requiredEmail: "unregistered@testuser.com",
      email: "unregistered@testuser.com",
      privacyURL: "http://testuser.com/priv.html",
      tosURL: "http://testuser.com/tos.html",
      ready: function() {
        equal($(".tospp").length, 1, "tospp has been added to the DOM");
        start();
      }
    });
  });

  asyncTest("submit with `add: false` option opens a new tab with CREATE_EMAIL URL", function() {
    var messageTriggered = false;
    createController({
      add: false,
      email: "unregistered@testuser.com",
      ready: function() {
        mediator.subscribe("primary_user_authenticating", function() {
          messageTriggered = true;
        });

        // Also checking to make sure the NATIVE is stripped out.
        win.document.location.hash = "#NATIVE";

        controller.submit(function() {
          equal(win.document.location, AUTH_URL + "?email=unregistered%40testuser.com&return_to=sign_in%23CREATE_EMAIL%3Dunregistered%40testuser.com");
          equal(messageTriggered, true, "primary_user_authenticating triggered");
          start();
        });
      }
    });
  });

  asyncTest("submit with `add: true` option opens a new tab with ADD_EMAIL URL", function() {
    createController({
      add: true,
      email: "unregistered@testuser.com"
    });

    // Also checking to make sure the NATIVE is stripped out.
    win.document.location.hash = "#NATIVE";

    controller.submit(function() {
      equal(win.document.location, AUTH_URL + "?email=unregistered%40testuser.com&return_to=sign_in%23ADD_EMAIL%3Dunregistered%40testuser.com");
      start();
    });
  });

  asyncTest("submit with no callback", function() {
    createController({
      add: true,
      email: "unregistered@testuser.com",
      ready: function() {
        var error;
        try {
          controller.submit();
        }
        catch(e) {
          error = e;
        }

        equal(typeof error, "undefined", "error is undefined");
        start();
      }
    });
  });

  asyncTest("cancel triggers the cancel_state", function() {
    createController({
      add: true,
      email: "unregistered@testuser.com",
      ready: function() {
        testHelpers.register("cancel_state");

        controller.cancel(function() {
          equal(testHelpers.isTriggered("cancel_state"), true, "cancel_state is triggered");
          start();
        });
      }
    });
  });

  asyncTest("create with proxy idp - verify without user interaction", function() {
    xhr.useResult("proxyidp");

    mediator.subscribe("primary_user_authenticating", function(msg, data) {
      equal(data.url, PROXY_AUTH_URL + "?email=registered%40testuser.com&return_to=sign_in%23CREATE_EMAIL%3Dregistered%40testuser.com");
    });

    createController({
      add: false,
      email: "registered@testuser.com",
      ready: function() {
        equal(win.document.location, PROXY_AUTH_URL + "?email=registered%40testuser.com&return_to=sign_in%23CREATE_EMAIL%3Dregistered%40testuser.com", "document.location correctly set");
        start();
      }
    });

  });

  asyncTest("submit for normal gmail - window does not get resized", function() {
    createController({
      add: false,
      email: "testuser@gmail.com",
      ready: function() {
        controller.submit(function() {
          equal(win.width, 0, "width not set");
          equal(win.height, 0, "height not set");
          start();
        });
      }
    });
  });

  asyncTest("submit for proxied gmail - window gets resized", function() {
    xhr.useResult("proxyidp");

    createController({
      add: false,
      email: "registered@gmail.com",
      ready: function() {
        // Do not need to call submit in this case, it should be done
        // automatically.
        ok(win.width, "width set");
        ok(win.height, "height set");
        start();
      }
    });
  });

  asyncTest("submit for proxied yahoo - window does not get resized", function() {
    xhr.useResult("proxyidp");

    createController({
      add: false,
      email: "registered@yahoo.com",
      ready: function() {
        // Do not need to call submit in this case, it should be done
        // automatically.
        equal(win.width, 0, "width not set");
        equal(win.height, 0, "height not set");
        start();
      }
    });
  });

  asyncTest("submit for proxied hotmail - window gets resized", function() {
    xhr.useResult("proxyidp");

    createController({
      add: false,
      email: "registered@hotmail.com",
      ready: function() {
        ok(win.width, "width set");
        ok(win.height, "height set");
        start();
      }
    });
  });

}());

