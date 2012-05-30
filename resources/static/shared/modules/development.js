/*jshint browser:true, jQuery: true, forin: true, laxbreak:true */
/*global BrowserID: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

BrowserID.Modules.Development = (function() {
  "use strict";

  var bid = BrowserID,
      dom = bid.DOM,
      renderer = bid.Renderer,
      count = 0;


  function onDevelopmentClick(event) {
    count++;


    if(count === 4) {
      if(!document.getElementById("development")) {
        renderer.append("body", "development", {});
      }

      dom.addClass("body", "development");
      this.click("#showError", showError);
      this.click("#showDelay", showDelay);
      this.click("#showWait", showWait);
      this.click("#hideAll,footer,#errorBackground", hideScreens);
      this.click("#closeDevelopment", close);
    }
  }

  function showError() {
    this.renderError("error", {
      action: {
        title: "Error title",
        message: "This is an error message"
      },
      network: {
        type: "GET",
        url: "fakeURL"
      }
    });
  }

  function showDelay() {
    this.renderDelay("wait", {
      title: "Delay Screen",
      message: "Delay Message"
    });
  }

  function showWait() {
    this.renderWait("wait", {
      title: "Wait Screen",
      message: "Wait Message"
    });
  }

  function hideScreens() {
    this.hideError();
    this.hideDelay();
    this.hideWait();
  }


  function close() {
    dom.removeClass("body", "development");
    count = 0;
  }

  var Module = bid.Modules.PageModule.extend({
    start: function(config) {
      this.click("#showDevelopment", onDevelopmentClick);
    }
  });

  return Module;
}());

