/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// this file is an abstraction around "primary identity authority" support,
// specifically checks and a cache to see if a primary supports browserid
// natively.

const
https = require('https'),
http = require('http'),
logger = require('./logging.js').logger,
urlparse = require('urlparse'),
jwk = require('jwcrypto/jwk'),
jwcert = require("jwcrypto/jwcert"),
vep = require("jwcrypto/vep"),
jwt = require("jwcrypto/jwt"),
config = require("./configuration.js");

const WELL_KNOWN_URL = "/.well-known/browserid";

// Protect from stack overflows and network DDOS attacks
const MAX_AUTHORITY_DELEGATIONS = 6;

const HOSTNAME = urlparse(config.get('public_url')).host;

var g_shim_cache = {};

// This becomes async
function parseWellKnownBody(body, domain, delegates, cb) {
  var v = JSON.parse(body);
  const want = [ 'public-key', 'authentication', 'provisioning' ];

  var got = [];
  if (typeof v === 'object') {
    got = Object.keys(v);
  }
  var bail = false;
  got.forEach(function (k) {
    if ('authority' === k) {
      // Recursion
      var dels = Object.keys(delegates);
      if (delegates[domain] !== undefined) {
        // return to break out of function, but callbacks are actual program flow
        bail = true;
        return cb("Circular reference in delegating authority " + JSON.stringify(delegates));
      }
      if (Object.keys(delegates).length > MAX_AUTHORITY_DELEGATIONS) {
        bail = true;
        return cb("Too many hops while delegating authority " + JSON.stringify(dels));
      }
      logger.debug(domain,' is delegating to', v[k]);
      // recurse into low level get /.well-known/browserid and parse again?
      // If everything goes well, finally call our original callback
      delegates[domain] = dels.length;
      getWellKnown(v[k], delegates, function (err, nbody, ndomain, ndelegates) {
        if (err) {
          cb(err);
        }
        parseWellKnownBody(nbody, ndomain, ndelegates, cb);
      });
      bail = true;;
    }
  });
  if (bail) return;
  want.forEach(function(k) {
    if (-1 === got.indexOf(k)) {
      cb("missing required key: " + k);
      bail = true;
    }
  });
  if (bail) return;

  // Allow SHIMMED_PRIMARIES to change example.com into 127.0.0.1:10005
  var url_prefix = 'https://' + domain;
  if (g_shim_cache[domain]) {
    url_prefix = g_shim_cache[domain].origin;
  }

  var urls = {
    auth: url_prefix + v.authentication,
    prov: url_prefix + v.provisioning,
  };

  // validate the urls
  urlparse(urls.auth).validate();
  urlparse(urls.prov).validate();

  // parse the public key
  return cb(null, {
    publicKey: jwk.PublicKey.fromSimpleObject(v['public-key']),
    urls: urls
  });
}



// Support "shimmed primaries" for local development.  That is an environment variable that is any number of
// CSV values of the form:
//  <domain>|<origin>|<path to .well-known/browserid>,
// where 'domain' is the domain that we would like to shim.  'origin' is the origin to which traffic should
// be directed, and 'path to .well-known/browserid' is a path to the browserid file for the domain
//
// defining this env var will pre-seed the cache so local testing can take place.  example:
//
// SHIMMED_PRIMARIES=eyedee.me|http://127.0.0.1:10005|example/primary/.well-known/browserid

if (process.env['SHIMMED_PRIMARIES']) {
  var shims = process.env['SHIMMED_PRIMARIES'].split(',');
  shims.forEach(function(shim) {
    var a = shim.split('|');
    var domain = a[0], origin = a[1], path = a[2];
    var body = require('fs').readFileSync(path);
    g_shim_cache[domain] = {
      origin: origin,
      body: body
    };
    logger.info("inserted primary info for '" + domain + "' into cache, TODO point at '" + origin + "'");
  });
}

var getWellKnown = function (domain, delegates, cb) {
  function handleResponse(res) {
    if (res.statusCode !== 200) {
      logger.debug(domain + ' is not a browserid primary - non-200 response code to ' + WELL_KNOWN_URL);
      return cb(null, false, null);
    }
    if (res.headers['content-type'].indexOf('application/json') !== 0) {
      logger.debug(domain + ' is not a browserid primary - non "application/json" response to ' + WELL_KNOWN_URL);
      return cb(null, false, null);
    }

    var body = "";
    res.on('data', function(chunk) { body += chunk; });
    res.on('end', function() {
      cb(null, body, domain, delegates);
    });
  };

  if (g_shim_cache[domain]) {
    return cb(null, g_shim_cache[domain].body, domain, delegates);
  }

  // now we need to check to see if domain purports to being a primary
  // for browserid
  var httpProxy = config.has('http_proxy') ? config.get('http_proxy') : null;

  var req;
  if (httpProxy && httpProxy.port && httpProxy.host) {
    // In production we use Squid as a reverse proxy cache to reduce how often
    // we request this resource.
    req = http.get({
      host: httpProxy.host,
      port: httpProxy.port,
      path: 'https://' + domain + WELL_KNOWN_URL,
      headers: {
        host: domain
      }
    }, handleResponse);
  } else {
    req = https.get({
      host: domain,
      path: WELL_KNOWN_URL,
      agent: false
    }, handleResponse);
  }

  req.on('error', function(e) {
    logger.debug(domain + ' is not a browserid primary: ' + e.toString());
    cb(null, false, null);
  });
};

exports.checkSupport = function(domain, cb, delegates) {

  // Delegates will be populatd via recursion to detect cycles
  if (! delegates) {
    delegates = {};
  }
  if (!cb) throw "missing required callback function";

  if (config.get('disable_primary_support')) {
    return process.nextTick(function() { cb(null, false); });
  }

  if (typeof domain !== 'string' || !domain.length) {
    return process.nextTick(function() { cb("invalid domain"); });
  }
  getWellKnown(domain, delegates, function (err, body, domain, cbdelegates) {
    if (err) {
      logger.debug(err);
      return cb(err);
    } else {
      if (! body) {
        return cb(null, null, null);
      }

      try {
        var r = parseWellKnownBody(body, domain, cbdelegates, function (err, r) {
          if (err) {
            logger.debug(err);
            cb(err);
          } else {
            logger.info(domain + ' is a valid browserid primary');
            return cb(null, r.urls, r.publicKey);
          }

        });

      } catch(e) {
        var msg = domain + ' is a broken browserid primary, malformed dec of support: ' + e.toString();
        logger.debug(msg);
        return cb(msg);
      }
    }
  });
};


exports.getPublicKey = function(domain, cb) {
  exports.checkSupport(domain, function(err, urls, publicKey) {
    if (publicKey === null) {
      return cb("can't get public key for " + domain);
    }
    cb(err, publicKey);
  });
};

// Does emailDomain actual delegate to the issuingDomain?
exports.delegatesAuthority = function (emailDomain, issuingDomain, cb) {
  exports.checkSupport(emailDomain, function(err, urls, publicKey) {
    // Check http or https://{issuingDomain}/some/sign_in_path
    if (! err && urls && urls.auth &&
        urls.auth.indexOf('://' + issuingDomain + '/') !== -1) {
      cb(true);
    }
    cb(false);
  });
}

// verify an assertion generated to authenticate to browserid
exports.verifyAssertion = function(assertion, cb) {
  if (config.get('disable_primary_support')) {
    return process.nextTick(function() { cb("primary support disabled") });
  }

  try {
    var bundle = vep.unbundleCertsAndAssertion(assertion);
  } catch(e) {
    return process.nextTick(function() { cb("malformed assertion: " + e); });
  }
  jwcert.JWCert.verifyChain(
    bundle.certificates,
    new Date(), function(issuer, next) {
      // issuer cannot be the browserid
      if (issuer === HOSTNAME) {
        cb("cannot authenticate to browserid with a certificate issued by it.");
      } else {

        exports.getPublicKey(issuer, function(err, pubKey) {
          if (err) return cb(err);
          next(pubKey);
        });
      }
    }, function(pk, principal) {
      try {
        var tok = new jwt.JWT();
        tok.parse(bundle.assertion);

        // audience must be browserid itself
        var want = urlparse(config.get('public_url')).originOnly();
        var got = urlparse(tok.audience).originOnly();

        if (want.toString() !== got.toString()) {
          return cb("can't log in with an assertion for '" + got.toString() + "'");
        }
        if (!tok.verify(pk)) throw "verification failure";
        cb(null, principal.email);
      } catch(e) {
        cb("can't verify assertion: " + e.toString());
      }
    }, cb);
};
