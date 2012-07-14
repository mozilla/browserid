/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const url = require('url');

/**
* config is an associative array with keys that are domains
* and values that are BigTent URLs.
*/
module.exports = function (config) {
  var proxied_domains = Object.keys(config);
  return {
    /**
     * Returns true if email is proxied, false otherwise.
     */
    isProxyIdP: function (email) {
      var pieces = email.split('@');
      if (pieces.length == 2) {
        if (proxied_domains.indexOf(pieces[1].toLowerCase()) >= 0) {
          return true;
        }
      }
      return false;
    },

    /**
     * Returns URL of bigtent env or undefined
     */
    bigtentUrl: function (email) {
      var pieces = email.split('@');
      if (pieces.length == 2) {
        return config[pieces[1].toLowerCase()];
      }
      return undefined;
    },
    /**
     * Returns Hostname of bigtent env or undefined
     */
    bigtentHost: function (email) {
      var bturl = this.bigtentUrl(email);
      if (bturl) {
          return url.parse(bturl).hostname
      }
      return undefined;
    }
  };
};