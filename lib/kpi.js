/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const coarse = require('../coarse_user_agent_parser'),
      config = require('./configuration.js'),
      http = require('http'),
      https = require('https'),
      logger = require('./logging.js').logger,
      querystring = require('querystring'),
      und = require('underscore'),
      urlparse = require('urlparse'),
      TEN_MIN_IN_MS = 10 * 60 * 1000;

// KPI format: https://github.com/mozilla/kpiggybank#http-api
// also https://wiki.mozilla.org/Privacy/Reviews/KPI_Backend#Example_data
//
// input: kpi_json => kpi data object
//        kpi_ua => request user-agent string, to be parsed here
//        cb => fired when done
var store = function(kpi_json, req_ua, cb) {
  // both req_ua and cb are optional
  if (typeof req_ua == 'function') { cb = req_ua && req_ua = null; }
  var options,
      db_url,
      kpi_req,
      http_proxy;

  // Parse out the useragent coarsely for anonymity
  if (req_ua) {
    var ua = coarse.parse(req_ua);
    und.each(kpi_json, function (kpi) {
      if (! kpi.user_agent) {
        kpi.user_agent = {};
      }
      und.extend(kpi.user_agent, ua);
    });
  }

  // Out of concern for the user's privacy, round the server timestamp
  // off to the nearest 10-minute mark.
  und.each(kpi_json, function (kpi) { delete kpi.local_timestamp;
    if (! kpi.timestamp) {
      kpi.timestamp = new Date().getTime();
    }
    kpi.timestamp = kpi.timestamp - (kpi.timestamp % TEN_MIN_IN_MS);
  });

  if (!! config.get('kpi_backend_db_url')) {

    var post_data = querystring.stringify({
      'data' : JSON.stringify(kpi_json)
    });

    db_url = urlparse(config.get('kpi_backend_db_url'));

    http_proxy = config.has('http_proxy') ? config.get('http_proxy') : null;
    
    if (http_proxy && http_proxy.port && http_proxy.host) {
      options = {
        host: http_proxy.host,
        port: http_proxy.port,
        path: db_url,
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': post_data.length
        }
      };
      kpi_req = http.request(options);
    } else {
      options = {
        hostname: db_url.host,
        path: db_url.path,
        method: 'POST',
        rejectUnauthorized: true,
        agent: false,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': post_data.length
        }
      };
      
      if (db_url.port) {
        options.port = db_url.port;
      }
      
      var protocol = (db_url.scheme === 'https') ? https : http;
      kpi_req = protocol.request(options);
    }
    
    kpi_req.on('response', function(res) {
      if (res.statusCode !== 201) {
        logger.warn('KPI Backend (or proxy) response code is not 201: ' + res.statusCode);
      } else {
        logger.info('interaction data successfully posted to KPI Backend');
      }  
    });
    
    kpi_req.on('error', function (e) {
      // TODO statsd counter
      logger.error('KPI Backend request error: ' + e.message);
    });

    logger.debug("sending request to KPI backend: " + config.get('kpi_backend_db_url'));
    kpi_req.write(post_data);
    kpi_req.end();

  } else {
    if (cb) cb(false);
  }
};

module.exports = store;
