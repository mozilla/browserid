/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const
wcli = require('../../lib/wsapi_client'),
version = require('../../lib/version.js');

// the client "context"
var context = {};

// the configuration
var configuration = {
  browserid: 'http://127.0.0.1:10002/'
};

exports.clearCookies = function(ctx) {
  wcli.clearCookies(ctx||context);
};

exports.injectCookies = function(cookies, ctx) {
  wcli.injectCookies({cookieJar: cookies}, ctx||context);
};

exports.getCookie = function(which, ctx) {
  return wcli.getCookie(ctx||context, which);
};

exports.get = function (path, getArgs, ctx) {
  return function () {
    wcli.get(configuration, fixVersion(path), ctx||context, getArgs, this.callback);
  };
};

exports.post = function (path, postArgs, ctx) {
  return function () {
    wcli.post(configuration, fixVersion(path), ctx||context, postArgs, this.callback);
  };
};

exports.getCSRF = function(ctx) {
  var context = ctx||context;
  if (context && context.session && context.session.csrf_token) {
    return context.session.csrf_token;
  }
  return null;
};

// allows for multiple clients
exports.setContext = function (cxt) {
  context = cxt;
};

exports.getContext = function () {
  return context;
};

const API_REGEX = require('../../lib/wsapi.js').API_REGEX;

// provide correct wsapi version to unit tests that don't care
function fixVersion (path) {
  // /__heartbeat
  if (path.indexOf('/wsapi/') === -1) return path;
  var m = API_REGEX.exec(path);
  if (!m || ! m.length || m.length <= 0) throw new Error('Unfamiliar wsapi path with ' + path);

  // For /wsapi/a1234b3/foo
  // m[1] would be 'a1234b3/' Note the last '/'
  // m[2] would be 'foo'

  // For /wsapi/bar
  // m[1] would be undefined
  // m[2] would be 'bar'
  
  if (!! m[1]) {
    return path;
  } else {
    var actualPath = m[2],
        SHA = version();
    if(! SHA) throw new Error('Unable to load code version');
    var newPath = ['/wsapi', SHA, actualPath];
    return newPath.join('/');
  }
}