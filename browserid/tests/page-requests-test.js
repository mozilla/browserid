#!/usr/bin/env node

/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla BrowserID.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

require('./lib/test_env.js');

const assert = require('assert'),
http = require('http'),
vows = require('vows');

var suite = vows.describe('page requests');

// This set of tests check to make sure all of the expected pages are served 
// up with the correct status codes.  We create a thin REST client and take 
// a lot of the code from the vows page to check the status codes of each 
// request.


// create a thin REST client to use.
var rest = (function() {
  var client = http.createClient(10002, 'localhost');
  var doRequest = function(type, url, callback) {
    var request = client.request(type, url);
    request.end();
    request.on('response', function (response) {
      callback(null, response);  
    });
  }

  return {
    get: doRequest.bind(this, 'GET'),
    post: doRequest.bind(this, 'POST')
  };
}());


// Taken from the vows page.
function assertStatus(code) {
  return function (e, res) {
    assert.equal(res.statusCode, code);
  };
}

function respondsWith(status) {
  var context = {
    topic: function () {
      // Get the current context's name, such as "POST /"
      // and split it at the space.
      var req    = this.context.name.split(/ +/), // ["POST", "/"]
          method = req[0].toLowerCase(),         // "post"
          path   = req[1];                       // "/"

      // Perform the contextual client request,
      // with the above method and path.
      rest[method](path, this.callback);
    }
  };

  // Create and assign the vow to the context.
  // The description is generated from the expected status code
  // and the status name, from node's http module.
  context['should respond with a ' + status + ' '
         + http.STATUS_CODES[status]] = assertStatus(status);

  return context;
}

suite.addBatch({
  'GET /':                       respondsWith(200),
  'GET /signup':                 respondsWith(200),
  'GET /forgot':                 respondsWith(200),
  'GET /signin':                 respondsWith(200),
  'GET /about':                  respondsWith(200),
  'GET /tos':                    respondsWith(200),
  'GET /privacy':                respondsWith(200),
  'GET /verify_email_address':   respondsWith(200),
  'GET /add_email_address':      respondsWith(200),
  'GET /pk':                     respondsWith(200),
  'GET /vepbundle':              respondsWith(200),
  'GET /signin':                 respondsWith(200),
  'GET /unsupported_dialog':     respondsWith(200)
});

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
