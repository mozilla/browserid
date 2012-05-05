/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const config = require('./configuration');

var proxied = config.get('bigtent_domains');

exports.isProxyIdP = function (email) {
  var pieces = email.split('@');
  if (pieces.length == 2) {
    if (proxied.indexOf(pieces[1].toLowerCase()) >= 0) {
      return true;
    }
  }
  return false;
}
