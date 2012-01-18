/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const
emailer = require('nodemailer'),
fs = require('fs'),
path = require('path'),
mustache = require('mustache'),
config = require('./configuration.js'),
logger = require('./logging.js').logger;

/* if smtp parameters are configured, use them */
var smtp_params = config.get('smtp');
if (smtp_params && smtp_params.host) {
  emailer.SMTP = { host: smtp_params.host };
  logger.info("delivering email via SMTP host: " +  emailer.SMTP.host);
  if (smtp_params.user) {
    emailer.SMTP.use_authentication = true;
    emailer.SMTP.user = smtp_params.user;
    emailer.SMTP.pass = smtp_params.pass;
    if (smtp_params.port) {
      emailer.SMTP.port = smtp_params.port;
    }

    logger.info("authenticating to email host as " +  emailer.SMTP.user);
  }
}

const template = fs.readFileSync(path.join(__dirname, "browserid", "prove_template.txt")).toString();

var interceptor = undefined;

/**
 * allow clients to intercept email messages programatically for local
 * testing. The `interceptor` is a function which accepts three arguments,
 *
 *   * `email` - the email that is being verified
 *   * `site` - the RP
 *   * `secret` - the verification secret (usually embedded into a url)
 *
 * Limitations: only a single interceptor may be set, generalize
 * as needed.
 */
exports.setInterceptor = function(callback) {
  interceptor = callback;
};

function doSend(landing_page, email, site, secret) {
  var url = config.get('URL') + "/" + landing_page + "?token=" + encodeURIComponent(secret);

  if (interceptor) {
    interceptor(email, site, secret);
  } else if (smtp_params && smtp_params.host) {
    emailer.send_mail({
      sender: "BrowserID@browserid.org",
      to: email,
      subject : "Complete Login to " + site + " using BrowserID",
      body: mustache.to_html(template, { email: email, link: url, site: site })
    }, function(err, success){
      if(!success) {
        logger.error("error sending email: " + err);
        logger.error("verification URL: " + url);
      }
    });
  } else {
    // log verification email to console separated by whitespace.
    console.log("\nVERIFICATION URL:\n" + url + "\n");
  }
};

exports.sendNewUserEmail = function(email, site, secret) {
  doSend('verify_email_address', email, site, secret);
};

exports.sendAddAddressEmail = function(email, site, secret) {
  doSend('add_email_address', email, site, secret);
};
