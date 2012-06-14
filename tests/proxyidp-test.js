#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const
assert = require('assert'),
vows = require('vows');

const GOOG = "https://google.login.persona.org",
MICRO = "https://microsoft.login.persona.org";

var suite = vows.describe('proxyidp');

suite.addBatch({
  "Make some config": {
    topic: function() {
      return require('../lib/proxyidp.js')({
        "gmail.com":   GOOG,
        "yahoo.com":   "https://yahoo.login.persona.org",
        "hotmail.com": MICRO
      });
    },
    "A known email gets it's correct endpoint": function(proxyidp) {
      assert.equal(proxyidp.bigtentUrl('alice@gmail.com'), GOOG);
      assert.equal(proxyidp.bigtentUrl('bob@hotmail.com'), MICRO);
    },
    "Unknown domains are undefined": function (proxyidp) {
      assert.strictEqual(proxyidp.bigtentUrl('judy@hamster.dance'), undefined);
    },
    "We can test for known and unknown domains": function (proxyidp) {
      assert.ok(proxyidp.isProxyIdP('alice@gmail.com'));
      assert.ok(proxyidp.isProxyIdP('bob@hotmail.com'));
      assert.ok(proxyidp.isProxyIdP('joey@yahoo.com'));

      assert.equal(proxyidp.isProxyIdP('judy@hamster.dance'), false);
    }
  }
});

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
