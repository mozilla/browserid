/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* first draft cassandra driver for browserid. a fairly direct port
 * of the mysql schema, adding lookup tables where additional indexed
 * columns are present in the mysql schema, eg email.user and
 * email.address.
 */

// TODO require cassandra libs in here

/*
 * CQL3 Schema:
 */

const schemas = [];



// method signatures pulled from mysql.js. this is the todo list.



// TODO this is used in some queries, maybe we want timeuuids rather than
//      generating, eg, `Math.floor(new Date().getTime() / 1000)` in here
//      like we do with mysql.
function now() {}
function logUnexpectedError(detail) {}

/*
  note: the mysql methods have a bunch of boilerplate, i'd love
  to extract it out:

  function(params, cb) {
    client.query(
      'SOME SQL STRING WHERE foo = ? AND bar = ?',
      [ foo, bar ],
      function(err, rows) {
        cb(err, rows && resp.length === 1 ? rows[0].baz : undefined);
      }
    );
  }

  a simpler API could just pass in a query, params, and a filter function:

  query('SQL STRING HERE', params, function(rows) {
    return rows && resp.length === 1 ? rows[0].baz : undefined
  });

  where you assume that errbacks are handled by the query() func.

*/ 

// db connection queries. open also creates schema.
exports.open = function(cfg, cb) {}
exports.close = function(cb) {}
exports.closeAndRemove = function(cb) {}

// email+user table query
exports.emailKnown = function(email, cb) {}

// email table queries
exports.userKnown = function(uid, cb) {}
exports.emailInfo = function(email, cb) {}
exports.emailType = function(email, cb) {}
exports.emailIsVerified = function(email, cb) {}

// idp table queries
exports.forgetIDP = function(domain, cb) {}
exports.updateIDPLastSeen  = function(domain, cb) {}
exports.getIDPLastSeen = function(domain, cb) {}

// staged table queries
exports.isStaged = function(email, cb) {}
exports.lastStaged = function(email, cb) {}
exports.stageUser = function(email, hash, cb) {}
exports.haveVerificationSecret = function(secret, cb) {}
exports.emailForVerificationSecret = function(secret, cb) {}
exports.authForVerificationSecret = function(secret, cb) {}
exports.verificationSecretForEmail = function(email, cb) {}

function addEmailToUser(userID, email, type, cb) {}
function getAndDeleteRowForSecret(secret, cb) {}
exports.completeCreateUser = function(secret, cb) {}
exports.completeConfirmEmail = function(secret, cb) {}
exports.completePasswordReset = function(secret, password, cb) {}
exports.addPrimaryEmailToAccount = function(uid, emailToAdd, cb) {}
exports.createUserWithPrimaryEmail = function(email, cb) {}
exports.emailsBelongToSameAccount = function(lhs, rhs, cb) {}
exports.userOwnsEmail = function(uid, email, cb) {}
exports.stageEmail = function(existing_user, new_email, hash, cb) {}
exports.emailToUID = function(email, cb) {}
exports.checkAuth = function(uid, cb) {}
exports.lastPasswordReset = function(uid, cb) {}
exports.updatePassword = function(uid, hash, invalidateSessions, cb) {}
exports.clearAuthFailures = function(uid, cb) {}
exports.incAuthFailures = function(uid, cb) {}
exports.listEmails = function(uid, cb) {}
exports.emailLastUsedAs = function(email, cb) {}
exports.updateEmailLastUsedAs = function(email, type, cb) {}
exports.removeEmail = function(authenticated_user, email, cb) {}
exports.cancelAccount = function(uid, cb) {}
exports.createUnverifiedUser = function(email, hash, cb) {}
exports.addTestUser = function(email, hash, cb) {}
exports.ping = function(cb) {}
