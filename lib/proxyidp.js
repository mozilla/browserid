/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// AOK TODO TEST

exports.isProxyIdP = function (email) {
  console.log('AOK wsapi/address_info.js isProxyIdP ' + email);
  var pieces = email.split('@');
  if (pieces.length == 2) {
    var proxied = ['gmail.com', 'yahoo.com', 'hotmail.com'];
    if (proxied.indexOf(pieces[1].toLowerCase()) >= 0) {
      return true;
    }
  }
  return false;
}
