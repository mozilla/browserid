#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

require('./lib/test_env.js');

process.env.PROXY_IDPS = '{"yahoo.com": "bigtent.domain"}';

const assert =
require('assert'),
vows = require('vows'),
start_stop = require('./lib/start-stop.js'),
wsapi = require('./lib/wsapi.js'),
db = require('../lib/db.js'),
config = require('../lib/configuration.js'),
secrets = require('../lib/secrets'),
http = require('http'),
querystring = require('querystring'),
path = require('path'),
primary = require('./lib/primary.js'),
jwcrypto = require('jwcrypto');

var suite = vows.describe('auth-with-assertion');

// disable vows (often flakey?) async error behavior
suite.options.error = false;

start_stop.addStartupBatches(suite);

const TEST_DOMAIN = 'example.domain',
      TEST_EMAIL = 'testuser@' + TEST_DOMAIN,
      TEST_ORIGIN = 'http://127.0.0.1:10002',
      OTHER_EMAIL = 'otheruser@' + TEST_DOMAIN;


// here we go!  let's authenticate with an assertion from
// a primary.

var primaryUser = new primary({
  email: TEST_EMAIL,
  domain: TEST_DOMAIN
});

suite.addBatch({
  "set things up": {
    topic: function() {
      primaryUser.setup(this.callback);
    },
    "works": function() {
      // nothing to do here
    }
  }
});

// now let's generate an assertion using this user
suite.addBatch({
  "generating an assertion": {
    topic: function() {
      primaryUser.getAssertion(TEST_ORIGIN, this.callback);
    },
    "succeeds": function(err, r) {
      assert.isString(r);
    },
    "and logging in with the assertion": {
      topic: function(err, assertion)  {
        wsapi.post('/wsapi/auth_with_assertion', {
          assertion: assertion,
          ephemeral: true
        }).call(this);
      },
      "works": function(err, r) {
        var resp = JSON.parse(r.body);
        assert.isObject(resp);
        assert.isTrue(resp.success);
      }
    }
  }
});

// next, let's verify that auth_with_assertion properly update
// `lastUsedAs`
suite.addBatch({
  "setting lastUsedAs to secondary": {
    topic: function() {
      db.updateEmailLastUsedAs(TEST_EMAIL, 'secondary', this.callback);
    },
    "works": function (err, lastUsedAs) {
      assert.isNull(err);
    },
    "then generating an assertion": {
      topic: function() {
        primaryUser.getAssertion(TEST_ORIGIN, this.callback);
      },
      "succeeds": function(err, r) {
        assert.isString(r);
      },
      "and logging in with the assertion": {
        topic: function(err, assertion)  {
          wsapi.post('/wsapi/auth_with_assertion', {
            assertion: assertion,
            ephemeral: true
          }).call(this);
        },
        "works": function(err, r) {
          var resp = JSON.parse(r.body);
          assert.isObject(resp);
          assert.isTrue(resp.success);
        },
        "and after a moment": {
          topic: function() {
            setTimeout(this.callback, 500);
          },
          "lastUsedAs": {
            topic: function() {
              db.emailLastUsedAs(TEST_EMAIL, this.callback);
            },
            "is set back to 'primary'": function(err, r) {
              assert.isNull(err);
              assert.equal(r, 'primary');
            }
          }
        }
      }
    }
  }
});

suite.addBatch({
  "generating a new intermediate keypair and then an assertion": {
    topic: function() {
      var expirationDate = new Date(new Date().getTime() + (2 * 60 * 1000));
      var self = this;

      jwcrypto.generateKeypair(
        {algorithm: "DS", keysize: 256},
        function(err, innerKeypair) {

          // sign this innerkeypair with the key from g_cert (g_keypair)
          jwcrypto.cert.sign(
            {publicKey: innerKeypair.publicKey, principal: {email: OTHER_EMAIL}},
            {issuedAt: new Date(), expiresAt: expirationDate},
            {}, primaryUser._keyPair.secretKey,
            function(err, innerCert) {

              jwcrypto.assertion.sign(
                {},
                {audience: TEST_ORIGIN, expiresAt: expirationDate},
                innerKeypair.secretKey, function(err, signedObject) {
                  if (err) return self.callback(err);

                  var fullAssertion = jwcrypto.cert.bundle(
                    [primaryUser._cert, innerCert], signedObject);

                  self.callback(null, fullAssertion);
                });
            });
        });
    },
    "succeeds": function(err, assertion) {
      assert.isString(assertion);
    },
    "and logging in with the assertion fails": {
      topic: function(err, assertion)  {
        wsapi.post('/wsapi/auth_with_assertion', {
          assertion: assertion,
          ephemeral: true
        }).call(this);
      },
      "fails": function(err, r) {
        var resp = JSON.parse(r.body);
        assert.isObject(resp);
        assert.isFalse(resp.success);
        assert.equal(resp.reason, "certificate chaining is not yet allowed");
      }
    }
  }
});

const BT_DOMAIN = 'bigtent.domain',
      BT_EMAIL = 'sita@yahoo.com',
      BT_PRIV_KEY = jwcrypto.loadSecretKey(
        require('fs').readFileSync(
          path.join(__dirname, '..', 'example', 'bigtent', 'key.secretkey')));

var bigTentUser;

suite.addBatch({
  "generating an assertion": {
    topic: function () {
      bigTentUser = new primary({
        email: BT_EMAIL,
        domain: BT_DOMAIN,
        privKey: BT_PRIV_KEY
      });
      bigTentUser.setup(this.callback);
    },
    "works":  {
      topic: function () {
        bigTentUser.getAssertion(TEST_ORIGIN, this.callback, 'bigtent.domain');
      },
      "succeeds": function (err, r) {
        assert.isString(r);
      },
      "and logging in with the assertion succeeds": {
        topic: function (err, assertion) {
          wsapi.post('/wsapi/auth_with_assertion', {
            assertion: assertion,
            ephemeral: true
          }).call(this);
        },
        "works": function (err, r) {
          var resp = JSON.parse(r.body);
          assert.isObject(resp);
          assert.isTrue(resp.success);
        }
      }
    }
  }
});

// now verify that assertions from the fallback do not auth for a domain
// that has primary support
var newClientKeypair;
suite.addBatch({
  "set up user key": {
    topic: function() {
      jwcrypto.generateKeypair({algorithm: "DS", keysize: 256}, this.callback);
    },
    "works": function(err, kp) {
      assert.isNull(err);
      assert.isObject(kp);
      newClientKeypair = kp;
    }
  }
});
suite.addBatch({
  "a cert signed by fallback for domain with primary support": {
    topic: function() {
      // we'll re-use the newClientKeypair, but must create a certificate
      // signed by the private key of the fallback
      var expiration = new Date(new Date().getTime() + (2 * 60 * 1000));
      jwcrypto.cert.sign(
        {
          publicKey: newClientKeypair.publicKey,
          principal: {email: "attacker@real.primary"}
        },
        {
          issuedAt: new Date(),
          issuer: "127.0.0.1",
          expiresAt: expiration
        }, {}, secrets.loadSecretKey(), this.callback);
    },
    "yields a good looking certificate": function (err, cert) {
      assert.isNull(err);
      assert.isString(cert);
    },
    "and generation of assertion": {
      topic: function(err, cert) {
        var expiration = new Date(new Date().getTime() + (2 * 60 * 1000));
        var self = this;
        jwcrypto.assertion.sign(
          {}, {
            audience: TEST_ORIGIN,
            expiresAt: expiration
          },
          newClientKeypair.secretKey, function(err, assertion) {
            if (err) return self.callback(err);
            var b = jwcrypto.cert.bundle([cert], assertion);
            self.callback(null, b);
          });
      },
      "works": function(e, assertion) {
        assert.isString(assertion);
        assert.equal(assertion.length > 0, true);
      },
      "and causes auth_with_assertion": {
        topic: function(err, assertion) {
          wsapi.post('/wsapi/auth_with_assertion', {
            assertion: assertion,
            ephemeral: true
          }).call(this);
        },
        "to return an error": function (err, r) {
          var resp = JSON.parse(r.body);
          assert.ifError(err);
          console.dir(resp);
          assert.strictEqual(resp.success, false);
        }
      }
    }
  }
});

start_stop.addShutdownBatches(suite);

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
