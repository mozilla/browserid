/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var wc = WinChan.onOpen(function(origin, args, cb) {
  if (window.location.hash === '#complete') cb();
  else {
    wc.detach();
    window.location = args;
  }
});
