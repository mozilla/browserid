/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


(function() {
  "use strict";

  var bid = BrowserID,
      XHR = bid.Modules.XHR,
      xhr,
      transport = bid.Mocks.xhr,
      mediator = bid.Mediator,
      testHelpers = bid.TestHelpers;

  module("common/js/modules/xhr", {
    setup: function() {
      transport.setDelay(0);
      xhr = XHR.create();
      xhr.init({ transport: transport, time_until_delay: 50 });
      testHelpers.setup({ xhr: xhr });
    },

    teardown: function() {
      testHelpers.teardown();
    }
  });

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
      url: "/wsapi/session_context",
      error: testHelpers.unexpectedXHRFailure,
      success: function(info) {
        ok(delayInfo, "xhr_delay called with delay info");
        equal(delayInfo.network.url, "/wsapi/session_context", "correct network info");
        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, "/wsapi/session_context", "correct network info");

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
      url: "/wsapi/session_context",
      error: function(info) {
        ok(errorInfo, "xhr_error called with delay info");
        equal(errorInfo.network.url, "/wsapi/session_context", "xhr_error called with correct network info");

        ok(info, "error callback called with delay info");
        equal(info.network.url, "/wsapi/session_context", "error callback called correct network info");

        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, "/wsapi/session_context", "correct network info");

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
      url: "/wsapi/session_context",
      error: testHelpers.unexpectedXHRFailure,
      success: function() {
        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, "/wsapi/session_context", "correct network info");
        start();
      }
    });
  });

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

    xhr.post({
      url: "/wsapi/authenticate_user",
      success: function() {
        ok(delayInfo, "xhr_delay called with delay info");
        equal(delayInfo.network.url, "/wsapi/authenticate_user", "correct network info");
        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, "/wsapi/authenticate_user", "correct network info");

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
      url: "/wsapi/authenticate_user",
      error: function(info) {
        ok(errorInfo, "xhr_error called with delay info");
        equal(errorInfo.network.url, "/wsapi/authenticate_user", "xhr_error called with correct network info");

        ok(info, "error callback called with delay info");
        equal(info.network.url, "/wsapi/authenticate_user", "error callback called correct network info");

        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, "/wsapi/authenticate_user", "correct network info");

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
      url: "/wsapi/authenticate_user",
      error: testHelpers.unexpectedXHRFailure,
      success: function() {
        ok(completeInfo, "xhr_complete called with complete info");
        equal(completeInfo.network.url, "/wsapi/authenticate_user", "correct network info");
        start();
      }
    });
  });

  asyncTest("abortAll aborts outstanding requests, triggers xhr_complete",
      function() {
    mediator.subscribe("xhr_complete", function(msg, info) {
      equal(info.network.url, "/slow_request");
      equal(info.xhr.statusText, "aborted");
      start();
    });

    xhr.get({
      url: "/slow_request",
      error: testHelpers.unexpectedXHRFailure,
      success: function() { ok(false) }
    });

    xhr.abortAll();
  });

}());
