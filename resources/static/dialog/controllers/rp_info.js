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

  function encodeForHTML(strToEncode) {
    if (!strToEncode) return;

    // The original approach of creating a div, setting the html, and
    // getting the div's innerText/textContent still runs scripts in IE9 if
    // the script being inserted has the defer="true" attribute.  Because of
    // this, sensitive characters are manually converted to use their HTML
    // encoded equivalents.

    // List of entities to replace with HTML encoded versions obtained from:
    // https://www.owasp.org/index.php/XSS_Prevention_Cheat_Sheet#RULE_.231_-_HTML_Escape_Before_Inserting_Untrusted_Data_into_HTML_Element_Content
    var cleaned = strToEncode.replace(/&/gm, '&amp;')
                             .replace(/</gm, "&lt;")
                             .replace(/>/gm, "&gt;")
                             .replace(/'/gm, '&#x27;')
                             .replace(/"/gm, '&quot;')
                             // when getting innerHTML, this is always
                             // converted back to a normal /
                             .replace(/\//gm, '&#x2F;');

    return cleaned;
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


      renderer.render("#rp_info", "rp_info", {
        hasHostname: !!options.hostname,
        hasName: !!options.name,
        hasLogo: !!options.logoURL
      });


      // Because name and logoURL come from user content, they cannot be
      // trusted. To avoid even the remote possibility of an XSS attack, we
      // write the src and rp_name and rp_hostname using Javascript methods
      // after cleansing the text so that adding scripts using these vectors
      // is mitigated.

      if (options.logoURL) {
        dom.setAttr("#rp_logo", "src", options.logoURL);
      }

      if (options.hostname) {
        dom.setInner("#rp_hostname", encodeForHTML(options.hostname));
      }

      if (options.name) {
        dom.setInner("#rp_name", encodeForHTML(options.name));
      }

      sc.start.call(this, options);
    }
  });

  sc = Module.sc;

  return Module;

}());

