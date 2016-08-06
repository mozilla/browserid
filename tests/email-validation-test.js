#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

require('./lib/test_env.js');

const
assert = require('assert'),
vows = require('vows'),
validate = require('../lib/validate.js'),
wsapi = require('./lib/wsapi.js'),
start_stop = require('./lib/start-stop.js');

var suite = vows.describe('email-validation-test');

start_stop.addStartupBatches(suite);

// this test verifies thatthe email validation system correctly
// follows the desired HTML5 email standards

var validEmail1 = 'test@test.com';
var validEmail2 = 'test-email@test.com';
var validEmail3 = '.test@test.com';
var validEmail4 = 'my.test@test.com';

var invalidEmail1 = 'test@-test.com';
var invalidEmail2 = 'test@';
var invalidEmail3 = 'test@.org';
var invalidEmail4 = 'test-foo@test-foo.test-test.com';

suite.addBatch({
  "Testing first valid email address": {
    topic: wsapi.get('/wsapi/address_info', {
      email: validEmail1
    }),
    "returns 200": function(err, r) {
      assert.strictEqual(r.code, 200);
    }
  }, 
  "Testing second valid email address": {
    topic: wsapi.get('/wsapi/address_info', {
      email: validEmail2
    }),
    "returns 200": function(err, r) {
      assert.strictEqual(r.code, 200);
    }
  },
  "Testing third valid email address": {
    topic: wsapi.get('/wsapi/address_info', {
      email: validEmail3
    }),
    "returns 200": function(err, r) {
      assert.strictEqual(r.code, 200);
    }
  },
  "Testing fourth valid email address": {
    topic: wsapi.get('/wsapi/address_info', {
      email: validEmail4
    }),
    "returns 200": function(err, r) {
      assert.strictEqual(r.code, 200);
    }
  },
  "Testing first invalid email address": {
    topic: wsapi.get('/wsapi/address_info', {
      email: invalidEmail1
    }),
    "returns 400": function(err, r) {
      assert.strictEqual(r.code, 400);
    }
  },
  "Testing second invalid email address": {
    topic: wsapi.get('/wsapi/address_info', {
      email: invalidEmail2
    }),
    "returns 400": function(err, r) {
      assert.strictEqual(r.code, 400);
    }
  },
  "Testing third invalid email address": {
    topic: wsapi.get('/wsapi/address_info', {
      email: invalidEmail3
    }),
    "returns 400": function(err, r) {
      assert.strictEqual(r.code, 400);
    }
  },
  "Testing fourth invalid email address": {
    topic: wsapi.get('/wsapi/address_info', {
      email: invalidEmail4
    }),
    "returns 400": function(err, r) {
      assert.strictEqual(r.code, 400);
    }
  }
});

// shut the server down and cleanup
start_stop.addShutdownBatches(suite);

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
