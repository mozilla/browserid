/*jshint browser:true, jQuery: true, forin: true, laxbreak:true */
/*global _: true, BrowserID: true, PageController: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


/**
 * Purpose:
 *  Display to the user RP related data such as hostname, name, and logo.
 */
BrowserID.Modules.RPInfo = (function() {
  "use strict";

  var bid = BrowserID,
      renderer = bid.Renderer,
      dom = bid.DOM,
      doc = document,
      sc;

  function validLogoURL(logoURL) {
    var protocolRegExp;

    if(doc.location.protocol === "http:") {
      // if we are in http mode, allow http or https images.  This is used for
      // local development where the server runs in http mode
      protocolRegExp = new RegExp("^http(s?):\/\/");
    }
    else {
      protocolRegExp = new RegExp("^https:\/\/");
    }
    return protocolRegExp.test(logoURL);
  }

  var Module = bid.Modules.PageModule.extend({
    start: function(options) {
      options = options || {};

      doc = options.document || document;

      // Note, logoURL should have been converted to either a data-uri or an https
      // resource by this point.  If it hasn't been, throw an error.
      var logoURL = options.logoURL;
      if(logoURL && !validLogoURL(logoURL)) {
        this.renderError("error", {
          action: {
            title: "error in " + logoURL,
            message: "improper usage of API - logoURL must be served using https://"
          }
        });
        return;
      }


      renderer.render("#rp_info", "rp_info", {
        hasHostname: !!options.hostname,
        hasName: !!options.name,
        hasLogo: !!options.logoURL
      });


      // Because name and logoURL come from user content, they cannot be
      // trusted. To avoid even the remote possibility of an XSS attack, we
      // write the src and rp_name and rp_hostname using Javascript methods.
      // For rp_name and rp_hostname, text is set by using setInnerText, which
      // eventually calls createTextNode with the contents.  This escapes any
      // characters and ensures that no scripts are added.
      if (options.logoURL) {
        dom.setAttr("#rp_logo", "src", options.logoURL);
      }

      if (options.hostname) {
        dom.setInnerText("#rp_hostname", options.hostname);
      }

      if (options.name) {
        dom.setInnerText("#rp_name", options.name);
      }

      sc.start.call(this, options);
    }
  });

  sc = Module.sc;

  return Module;

}());

