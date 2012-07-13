/*jshint esnext: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const
config = require('../configuration.js'),
db = require('../db.js'),
httputils = require('../httputils.js'),
logger = require('../logging').logger,
primary = require('../primary.js'),
proxyidp = require('../proxyidp.js')(config.get('bigtent')),
url = require('url'),
wsapi = require('../wsapi.js'),
util = require('util');

// return information about an email address.
//   type:  is this an address with 'primary' or 'secondary' support?
//   if type is 'secondary':
//     known: is this address known to browserid?
//   if type is 'primary':
//     auth: what is the url to send the user to for authentication
//     prov: what is the url to embed for silent certificate (re)provisioning

exports.method = 'get';
exports.writes_db = false;
exports.authed = false;
exports.args = {
  'email': 'email'
};
exports.i18n = false;

const emailRegex = /\@(.*)$/;

exports.process = function(req, res) {
  // parse out the domain from the email
  var email = req.params.email;
  var m = emailRegex.exec(email);

  // Saftey value for production branch only
  // (lth) ^^ what does this mean? ^^
  var done = false;
  var bt_done = false;
  primary.checkSupport(m[1], function(err, urls, publicKey, delegates) {
    if (done) {
      return;
    }
    done = true;
    if (err) {
      logger.warn('error checking "' + m[1] + '" for primary support: ' + err);
      return httputils.serverError(res, "can't check email address");
    }

    if (urls) {
      urls.type = 'primary';
      res.json(urls);
    } else if (proxyidp.isProxyIdP(email)) {
      var bigtent = proxyidp.bigtentHost(email);
      primary.checkSupport(bigtent, function(err, urls, publicKey, delegates) {
        if (bt_done) {
          return;
        }
        bt_done = true;
        if (err || ! urls) {
          logger.warn('error checking BigTent for IdP details: ' + err);
          return httputils.serverError(res, "BigTent unavailable");
        }
        urls.type = 'proxyidp';
        res.json(urls);
      });
    } else {
      db.emailKnown(req.params.email, function(err, known) {
        if (err) {
          return wsapi.databaseDown(res, err);
        } else {
          res.json({ type: 'secondary', known: known });
        }
      });
    }
  });
};
