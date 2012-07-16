/*jshint browser: true, forin: true, laxbreak: true */
/*global BrowserID: true*/
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A couple of helper functions specific to proxy IdPs.  Allows the caller to
 * check whther an auth_url belongs to a proxy IdP as well as what the proxy
 * IdP's window size is.
 */
BrowserID.ProxyIdP = (function() {
  "use strict";

  var PROXY_IDP_WHITELIST = [
    // allow only bigtent and bigtent subdomains. A way of making
    // this configurable would be useful so that the list is not hard coded
    // into the code.  Perhaps something coming across in session_context?
    /^https:\/\/([^\/]+\.)?bigtent\.mozilla\.org\/*/
  ];

  function isProxyIdP(auth_url) {
    if (!auth_url) return false;

    for (var i=0, proxiedRegEx; proxiedRegEx = PROXY_IDP_WHITELIST[i]; ++i) {
      if (auth_url.search(proxiedRegEx) > -1) return true;
    }

    return false;
  }

  // Yahoo! is handled by BigTent as well, but their window resizes itself.
  var RESIZE_TABLE = {
    "gmail.com$": { w: 900, h: 600 },
    "hotmail.com$": { w: 700, h: 488 }
  };

  function authWindowSize(auth_url, email) {
    // only resize the window if redirecting to a Big Tent IdP.  All other
    // IdPs should abide by our rules of 700x400 default.
    if (isProxyIdP(auth_url)) {
      for (var key in RESIZE_TABLE) {
        var regExp = new RegExp(key);
        if (regExp.test(email)) {
          return RESIZE_TABLE[key];
        }
      }
    }
  }

  return {
    isProxyIdP: isProxyIdP,
    authWindowSize: authWindowSize
  };

}());

