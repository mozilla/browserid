/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * first draft cassandra driver for browserid. a fairly direct port
 * of the mysql schema, adding lookup tables where additional indexed
 * columns are present in the mysql schema, eg email.user and
 * email.address.
 *
 * using compound primary keys to ensure related data is stored on
 * the same nodes in the cluster:
 * http://cassandra.apache.org/doc/cql3/CQL.html#createTablepartitionClustering
 */

// TODO require cassandra libs in here

/*
 * CQL3 Schema:
 */

const schemas = [
  "CREATE TABLE user (" +
    "id                uuid," +
    "passwd            varchar," +
    "lastPasswordReset timeuuid," +
    "failedAuthTries   int," +
    "PRIMARY KEY (id)" +
  ");",

  // XXX this is an extreme work in progress, just keeping notes in
  // here. 
  "CREATE TABLE email (
    id  uuid,
    user uuid,
    address varchar,
    type  varchar, // was an enum, need to enforce at app level
    verified bool,
    PRIMARY KEY (user,id) // do we really need compound keys? when do we need grouped data on the same machine?
    );"

  "CREATE TABLE email_to_user (
    email varchar,
    user uuid,
    PRIMARY KEY (email)
  )"
];



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

exports.emailKnown = function(email, cb) {}

exports.userKnown = function(uid, cb) {
  var query = "SELECT passwd FROM user WHERE id = ?",
    args = [ uid ];
}
exports.emailInfo = function(email, cb) {}
exports.emailType = function(email, cb) {}
exports.emailIsVerified = function(email, cb) {}

exports.forgetIDP = function(domain, cb) {}
exports.updateIDPLastSeen  = function(domain, cb) {}
exports.getIDPLastSeen = function(domain, cb) {}

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
exports.checkAuth = function(uid, cb) {
  var query = "SELECT passwd, failedAuthTries FROM user WHERE id = ?",
    args = [ uid ];
}
exports.lastPasswordReset = function(uid, cb) {
  // TODO: C* has dateOf(<timeuuid> time) and unixTimestampOf(<timeuuid> time),
  //       pick a node client and use whatever it exposes. here we expect a
  //       unix timestamp (seconds) not a millisecond timestamp (JS and C*)
  var query = "SELECT lastPasswordReset FROM user WHERE id = ?",
    args = [ uid ];
}
exports.updatePassword = function(uid, hash, invalidateSessions, cb) {
  var query = "UPDATE user SET passwd = ?, failedAuthTries = '0'",
    args = [ hash ];
  if (invalidateSessions) {
    // TODO mysql specified FROM_UNIXTIME(now()), does C* need this?
    query += ", lastPasswordReset = ?";
    args.push(now());
  }
}
exports.clearAuthFailures = function(uid, cb) {
  var query = "UPDATE user SET failedAuthTries = 0 WHERE id = ?",
    args = [ uid ];
}
exports.incAuthFailures = function(uid, cb) {
  // TODO not sure I can increment ints in this way. sadly counters can only be
  //      decremented, not reset to 0, and they can't be used in INSERTs. sigh
  var query = "UPDATE user SET failedAuthTries = failedAuthTries + 1 WHERE id = ?",
    args = [ uid ];
}
exports.listEmails = function(uid, cb) {}
exports.emailLastUsedAs = function(email, cb) {}
exports.updateEmailLastUsedAs = function(email, type, cb) {}
exports.removeEmail = function(authenticated_user, email, cb) {}
exports.cancelAccount = function(uid, cb) {}
exports.createUnverifiedUser = function(email, hash, cb) {}
exports.addTestUser = function(email, hash, cb) {}
exports.ping = function(cb) {}
