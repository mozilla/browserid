/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Models.RpInfo = (function() {
  "use strict";

  var bid = BrowserID,
      und,
      sc;

  var Module = bid.Modules.Module.extend({
    origin: und,
    hostname: und,
    backgroundColor: und,
    siteName: und,
    siteLogo: und,
    privacyPolicy: und,
    termsOfService: und,

    init: function(options) {
      var self = this;

      self.importFrom(options,
        'origin',
        'hostname',
        'backgroundColor',
        'siteName',
        'siteLogo',
        'privacyPolicy',
        'termsOfService');

      sc.init.call(self, options);
    }
  });

  sc = Module.sc;

  return Module;
}());

