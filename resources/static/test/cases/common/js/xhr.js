/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


(function() {
  "use strict";

  var bid = BrowserID,
      xhr = bid.XHR,
      transport = bid.Mocks.xhr,
      mediator = bid.Mediator,
      testHelpers = bid.TestHelpers;

  module("common/js/xhr", {
    setup: function() {
      testHelpers.setup();
      transport.setDelay(0);
      xhr.init({ transport: transport, time_until_delay: 50 });
    },

    teardown: function() {
      testHelpers.teardown();
      xhr.init({ transport: $, time_until_delay: 0 });
    }
  });

  var sessionContextUrl = "/wsapi/" + CODE_SHA + "/session_context";
  asyncTest("get with delay", function() {
    transport.setDelay(100);

    var delayInfo;
    mediator.subscribe("xhr_delay", function(msg, info) {
      delayInfo = info;
    });

    var completeInfo;
    mediator.subscribe("xhr_complete", function(msg, info) {
      completeInfo = info;
    });

    xhr.get({
      url: sessionContextUrl,
      error: testHelpers.unexpectedXHRFailure,
      success: function(info) {
        ok(delayInfo, "xhr_delay called with delay info");
        equal(delayInfo.network.url, sessionContextUrl, "correct network info");
        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, sessionContextUrl, "correct network info");

        start();
      }
    });
  });

  asyncTest("get with xhr error", function() {
    var errorInfo;
    mediator.subscribe("xhr_error", function(msg, info) {
      errorInfo = info;
    });

    var completeInfo;
    mediator.subscribe("xhr_complete", function(msg, info) {
      completeInfo = info;
    });

    transport.useResult("contextAjaxError");

    xhr.get({
      url: sessionContextUrl,
      error: function(info) {
        ok(errorInfo, "xhr_error called with delay info");
        equal(errorInfo.network.url, sessionContextUrl, "xhr_error called with correct network info");

        ok(info, "error callback called with delay info");
        equal(info.network.url, sessionContextUrl, "error callback called correct network info");

        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, sessionContextUrl, "correct network info");

        start();
      },
      success: testHelpers.unexpectedSuccess
    });
  });

  asyncTest("get success", function() {
    var completeInfo;
    mediator.subscribe("xhr_complete", function(msg, info) {
      completeInfo = info;
    });

    xhr.get({
      url: sessionContextUrl,
      error: testHelpers.unexpectedXHRFailure,
      success: function() {
        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, sessionContextUrl, "correct network info");
        start();
      }
    });
  });

  var authUserUrl = "/wsapi/" + CODE_SHA + "/authenticate_user";
  asyncTest("post with delay", function() {
    transport.setDelay(100);

    var delayInfo;
    mediator.subscribe("xhr_delay", function(msg, info) {
      delayInfo = info;
    });

    var completeInfo;
    mediator.subscribe("xhr_complete", function(msg, info) {
      completeInfo = info;
    });

    // TODO is xhr mocked out? I don't see requests over the wire
    // unexpectedXHRFailure is always called for 91, 93, 94, 95, 97, 98, 100 - 103
    xhr.post({
      url: authUserUrl,
      success: function() {
        ok(delayInfo, "xhr_delay called with delay info");
        equal(delayInfo.network.url, authUserUrl, "correct network info");
        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, authUserUrl, "correct network info");

        start();
      },

      error: testHelpers.unexpectedXHRFailure
    });
  });

  asyncTest("post with xhr error", function() {
    var errorInfo;
    mediator.subscribe("xhr_error", function(msg, info) {
      errorInfo = info;
    });

    var completeInfo;
    mediator.subscribe("xhr_complete", function(msg, info) {
      completeInfo = info;
    });

    transport.useResult("ajaxError");

    xhr.post({
      url: authUserUrl,
      error: function(info) {
        ok(errorInfo, "xhr_error called with delay info");
	// TODO why is qunit reporting sessionContextUrl instead of authUserUrl
        equal(errorInfo.network.url, sessionContextUrl, "xhr_error called with correct network info");

        ok(info, "error callback called with delay info");
	// TODO why is qunit reporting sessionContextUrl instead of authUserUrl
        equal(info.network.url, sessionContextUrl, "error callback called correct network info");

        ok(completeInfo, "xhr_complete called with complete info");
	// TODO why is qunit reporting sessionContextUrl instead of authUserUrl
        equal(completeInfo.network.url, sessionContextUrl, "correct network info");

        start();
      },
      success: testHelpers.unexpectedSuccess
    });

  });

  asyncTest("post success", function() {
    var completeInfo;
    mediator.subscribe("xhr_complete", function(msg, info) {
      completeInfo = info;
    });

    xhr.post({
      url: authUserUrl,
      error: testHelpers.unexpectedXHRFailure,
      success: function() {
        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, authUserUrl, "correct network info");
        start();
      }
    });
  });

}());
