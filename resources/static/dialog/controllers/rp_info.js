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

  function stripHTML(strToClean) {
    if (!strToClean) return;

    var tmp = document.createElement("div");
    tmp.innerHTML = strToClean;
    // The intent here is to strip out any HTML so that it is not possible to
    // add HTML with event handlers which would open the user to an XSS attack.
    // We are depending on the browsers to do this properly - they have well
    // vetted whitelists and regexps for doing this.
    return tmp.textContent || tmp.innerText;
  }

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


      // use stripHTML to make sure that no HTML or Javascript get through to
      // the user, we don't want to open the user up to being XSSed wby
      // some goon inserting JS that steals the user's credentials.
      var data = {
        hostname: stripHTML(options.hostname) || null,
        name: stripHTML(options.name) || null,
        logoURL: options.logoURL ? encodeURI(options.logoURL) : null
      };

      renderer.render("#rp_info", "rp_info", data);

      // Because name and logoURL come from user content, they cannot fully be
      // trusted. To avoid even the remote possibility of an XSS attack, we
      // write the src and rp_name using Javascript methods so that adding DOM
      // Event handlers is mitigated.
      if (data.logoURL) {
        dom.setAttr("#rp_logo", "src", data.logoURL);
      }

      if (data.name) {
        dom.setInner("#rp_name", data.name);
      }

      sc.start.call(this, options);
    }
  });

  sc = Module.sc;

  return Module;

}());

