/*jshint browser: true, forin: true, laxbreak: true */
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
      testElementExists = testHelpers.testElementExists,
      testElementNotExists = testHelpers.testElementDoesNotExist,
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

  module("dialog/js/modules/verify_primary_user", {
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

  asyncTest("personaTOSPP true - show TOS/PP", function() {
    createController({
      add: false,
      email: "unregistered@testuser.com",
      personaTOSPP: true,
      ready: function() {
        testElementExists("#persona_tospp");

        start();
      }
    });
  });


  asyncTest("personaTOSPP false - do not show TOS/PP", function() {
    createController({
      add: false,
      email: "unregistered@testuser.com",
      personaTOSPP: false,
      ready: function() {
        testElementNotExists("#persona_tospp");
        start();
      }
    });

  });


  asyncTest("submit opens a new tab with proper URL (updated for sessionStorage)", function() {
    var messageTriggered = false;
    createController({
      add: false,
      email: "unregistered@testuser.com",
      ready: function() {
        mediator.subscribe("primary_user_authenticating", function() {
          messageTriggered = true;
        });

        controller.submit(function() {
          equal(win.document.location, AUTH_URL + "?email=unregistered%40testuser.com");
          equal(messageTriggered, true, "primary_user_authenticating triggered");
          start();
        });
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
      equal(data.url, PROXY_AUTH_URL + "?email=registered%40testuser.com");
    });

    createController({
      add: false,
      email: "registered@testuser.com",
      ready: function() {
        equal(win.document.location, PROXY_AUTH_URL + "?email=registered%40testuser.com", "document.location correctly set");
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

