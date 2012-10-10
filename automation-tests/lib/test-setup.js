const
personatestuser = require('../lib/personatestuser.js'),
restmail = require('../lib/restmail.js'),
saucePlatforms = require('./sauce-platforms.js'),
wd = require('wd'),
_ = require('underscore');

require('./wd-extensions.js');

var testSetup = {};

// startup determines if browser sessions will be local or use saucelabs.
// should only be called once per session (potentially, once for many tests)
//
// saucelabs is used if:
//  - opts include sauceUser and sauceApiKey or
//  - env vars include PERSONA_SAUCE_USER and PERSONA_SAUCE_APIKEY
//
// opts may also include
//  - platform (a browser from the list in lib/sauce_platforms)
//  - desiredCapabilities (see json wire protocol for list of capabilities)
// env var equivalents are PERSONA_BROWSER and PERSONA_BROWSER_CAPABILITIES
testSetup.startup = function(opts) {
  opts = opts || {};
  _setSessionOpts(opts);

  var sauceUser = opts.sauceUser || process.env['PERSONA_SAUCE_USER'],
    sauceApiKey = opts.sauceApiKey || process.env['PERSONA_SAUCE_APIKEY'],
    browser;

  if (sauceUser && sauceApiKey) {
    browser = wd.remote('ondemand.saucelabs.com', 80, sauceUser, sauceApiKey);
    browser.on('status', function(info){
      // using console.error so we don't mix up plain text with junitxml
      // TODO do something nicer with this
      console.error('\x1b[36m%s\x1b[0m', info);
    });
  } else {
    browser = wd.remote();
  }

  var id = testSetup.browsers.push(browser);
  return id - 1;
}

// store multiple browsers until we can switch between sessions via d
testSetup.browsers = []

// these session opts aren't needed until the user requests a session via newSession()
// but we harvest them from the command line at startup time
function _setSessionOpts(opts) {
  opts = opts || {};
  var sessionOpts = {};

  // check for typos: throw error if requestedPlatform not found in list of supported sauce platforms
  var requestedPlatform = opts.platform || process.env['PERSONA_BROWSER'];
  if (requestedPlatform && !saucePlatforms.platforms[requestedPlatform]) {
    throw new Error('requested platform ' + requestedPlatform + 
                    ' not found in list of available platforms');
  }
  var platform = requestedPlatform ? saucePlatforms.platforms[requestedPlatform] : {};

  // add platform, browserName, version to session opts
  sessionOpts = _.extend(sessionOpts, platform);

  // pull the default desired capabilities out of the sauce-platforms file
  // overwrite if specified by user
  var desiredCapabilities = opts.desiredCapabilities || process.env['PERSONA_BROWSER_CAPABILITIES'] || {};
  sessionOpts = _.extend(sessionOpts, saucePlatforms.defaultCapabilities);
  sessionOpts = _.extend(sessionOpts, desiredCapabilities);

  testSetup.sessionOpts = sessionOpts;
}

// opts could be of the form:
// { browsers: 2, restmails: 1, eyedeemails: 1, personatestusers: 2
// or of the form
// { b:2, r:1, e:1, p:2 }
// just be polite and don't mix the two.
//
// cb could be of the form:
// function(err, fixtures) {
//   // either these are global or you declared them in outer scope
//   browser = fixtures.browsers[0];
//   secondBrowser = fixtures.browsers[1];
//   theEmail = fixtures.restmails[0];
//   eyedeemail = fixtures.eyedeemails[0];
//   firstUser = fixtures.personatestusers[0];
//   secondUser = fixtures.personatestusers[1];
// }
testSetup.setup = function(opts, cb) {
  var fixtures = {},
    restmails = opts.restmails || opts.r,
    eyedeemails = opts.eyedeemails || opts.e,
    personatestusers = opts.personatestusers || opts.p,
    browsers = opts.browsers || opts.b;

  if (restmails) {
    fixtures.r = fixtures.restmails = [];
    for (var i = 0; i < restmails; i++) {
      fixtures.restmails.push(restmail.randomEmail(10));
    }
  }
  if (eyedeemails) {
    fixtures.e = fixtures.eyedeemails = [];
    for (var i = 0; i < eyedeemails; i++) {
      fixtures.eyedeemails.push(restmail.randomEmail(10, 'eyedee.me'));
    }
  }
  if (personatestusers) {
    fixtures.p = fixtures.personatestusers = [];
    for (var i = 0; i < personatestusers; i++) {
      personatestuser.getVerifiedUser(function(err, user, blob) { 
        if (err) { return cb(err) }
        fixtures.personatestusers.push(user);
      })
    }
  }
  // since browsers timeout, set them up last
  if (browsers) {
    for (var i = 0; i < browsers; i++) {
      testSetup.startup();
    }
    // just use the browsers array directly
    fixtures.b = fixtures.browsers = testSetup.browsers;
  }
  cb(null, fixtures);
}
  
module.exports = testSetup;
