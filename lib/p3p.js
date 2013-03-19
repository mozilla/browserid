/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var policy = 'CP="This is not a P3P policy, but Mozilla deeply cares about ' +
             'your privacy. See http://www.mozilla.org/persona/privacy-policy ' +
             'for more."';

// add 'P3P' headers so that IE8, with default security settings, will allow
// us to set third-party cookies. See #2340
module.exports = function(req, res, next) {
  res.on('header', function() {
    res.setHeader('P3P', policy);
  });
  next();
};
