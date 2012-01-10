#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

require('./lib/test_env.js');

const assert =
require('assert'),
vows = require('vows'),
start_stop = require('./lib/start-stop.js'),
wsapi = require('./lib/wsapi.js'),
config = require('../lib/configuration.js'),
http = require('http');
secrets = require('../lib/secrets.js');

var suite = vows.describe('post-limiting');

// disable vows (often flakey?) async error behavior
suite.options.error = false;

start_stop.addStartupBatches(suite);

// test posting more than 10kb
suite.addBatch({
  "posting more than 10kb": {
    topic: function(assertion)  {
      var cb = this.callback;
      var req = http.request({
        host: '127.0.0.1',
        port: 10002,
        path: '/wsapi/authenticate_user',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        method: "POST"
      }, function (res) {
        cb(null, res);
      }).on('error', function (e) {
        cb(e);
      });
      req.write(secrets.weakGenerate(1024 * 10 + 1));
      req.end();
    },
    "fails": function (err, r) {
      assert.ok(/socket hang up/.test(err.toString()));
    }
  }
});

// test posting more than 10kb with content-length header
suite.addBatch({
  "posting more than 10kb with content-length": {
    topic: function(assertion)  {
      var cb = this.callback;
      var req = http.request({
        host: '127.0.0.1',
        port: 10002,
        path: '/wsapi/authenticate_user',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': 1024 * 10 + 1
        },
        method: "POST"
      }, function (res) {
        cb(null, res);
      }).on('error', function (e) {
        cb(e);
      });
      req.write(secrets.weakGenerate(1024 * 10 + 1));
      req.end();
    },
    "fails": function (err, r) {
      assert.strictEqual(413, r.statusCode);
    }
  }
});


start_stop.addShutdownBatches(suite);

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
