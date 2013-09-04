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

/* ridiculously high-level TODOs:
 *
 * TODO migration script from mysql. idempotency would be nice, for re-running.
 *      this should be easy, since INSERT does an UPDATE if record exists.
 *
 * TODO figure out realtime migration--maybe put a splitter/fanout queue in
 *      front of mysql and C*? could just be a nodejs process, our write load is
 *      not that high.
 * TODO add 'test_cassandra' to conf.env options and get unit tests working
 */

const
conf = require('../configuration.js'),
dbutils = require('./dbutils.js'),
helenus = require('helenus'),
logger = require('../logging.js').logger,
primary = require('../primary.js'),
secrets = require('../secrets.js');

var client;


/*
 * CQL3 Schema:
 */

// TODO come up with a consistent naming scheme for lookup tables, rethink user and email lookups.
// XXX need to be sure to create users/emails in the lookup tables as well as entity tables
// TODO if we use the timeuuid for identifiers, we can use the cqlsh NOW() method to generate
//      IDs. otherwise we have to generate uuids manually, and I'm concerned about collisions
//      given the low-entropy situation with EC2 instances...saodihfgalfdkjgna;lj.
// TODO default consistency level is ONE. when, if ever, do we need stronger consistency?
const schemas = [
  "CREATE TABLE user (" +
    "id                timeuuid," +
    "passwd            varchar," +
    "lastPasswordReset timeuuid," +
    "failedAuthTries   int," +
    "PRIMARY KEY (id)" +
  ");",

  /* do we need to identify emails with a uuid? the address is a better partition key. */
  "CREATE TABLE email (" +
    "address varchar," +
    "user timeuuid," +
    "type  varchar," +
    "verified boolean," +
    "PRIMARY KEY (address)" +
  ");",

  /* TODO userOwnsEmail only needs to know if the connection exists, but
     listEmails needs all of them--what approach is best? */

  "CREATE TABLE email_user_to_address (" +
    "user timeuuid," +
    "address varchar," +
    "PRIMARY KEY (user)" +
  ");",

  "CREATE TABLE idp (" +
    "domain varchar," +
    "lastSeen timeuuid," +
    "PRIMARY KEY (domain)" +
  ");",

  "CREATE TABLE staged (" +
    "email varchar," +
    "secret varchar," +
    "new_acct boolean," +
    "existing_user timeuuid," +
    "passwd varchar," +
    "ts timeuuid," +
    "PRIMARY KEY (email)" +
  ");",

  "CREATE TABLE staged_secret_to_email (" +
    "secret varchar," +
    "email varchar," +
    "PRIMARY KEY (secret)" +
  ");",

  /* to cancel account, we need to look up staged by existing_user. */
  "CREATE TABLE staged_existingUser_to_email (" +
    "existing_user timeuuid," +
    "email varchar," +
    "PRIMARY KEY (existing_user)" +
  ");"


];



// method signatures pulled from mysql.js. this is the todo list.



// XXX CQL accepts ISO 8601 dates as input for timeuuids
function now() { return new Date().toISOString() }
function logUnexpectedError(detail) {
  // first, get line number of callee
  var where;
  try { dne; } catch (e) { where = e.stack.split('\n')[2].trim(); }
  // now log it!
  logger.warn("unexpected database failure: " + detail + " -- " + where);
}

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
// this is purposely modeled closely after mysql.js to ease side-by-side
// code reviews. we can revise structure further out.
exports.open = function(cfg, cb) {
  if (client) throw "database is already open!";
  // cassandra config requires
  var options = {
    hosts: ['localhost:9160'],
    user: undefined,
    password: undefined,
    cqlVersion: '3.0.0'
  };

  Object.keys(options).forEach(function(param) {
    options[param] = (cfg[param] !== undefined ? cfg[param] : options[param]);
    if (options[param] === undefined) delete options[param];
  });

  // let's figure out the keyspace name
  var keyspace = cfg.name;
  if (!keyspace) keyspace = "browserid";

  // TODO this is new in C*, add to config.js
  var keyspaceProperties = cfg.keyspaceProperties || "{'class': 'SimpleStrategy', 'replication_factor': 1}"

  // create the client
  function doConnect() {
    logger.debug("connecting to cassandra: " + keyspace);
    options.keyspace = keyspace;
    client = new helenus.ConnectionPool(options);
    client.connect(function(err, keyspace) {
      logger.debug("connection to cassandra " + (err ? ("fails: " + err) : "established"));
      cb(err);
    });
  }

  // TODO this structure makes me yearn for promises, but it works
  // for the initial port to C*.
  if (cfg.create_schema) {
    logger.debug("creating keyspace and tables if required");
    var createClient = new helenus.ConnectionPool(options);
    createClient.query("CREATE KEYSPACE " + keyspace + " WITH " + keyspaceProperties, function(err) {
      // TODO when we move to Cassandra 2.0, add 'IF NOT EXISTS'. for now checking manually.
      if (err && err.message.indexOf('Cannot add existing keyspace') === -1) {
        // oh shit, it's a real error.
        logUnexpectedError(err);
        cb(err);
        return;
      }
      createClient.cql("USE " + keyspace, function(err) {
        if (err) {
          logUnexpectedError(err);
          cb(err);
          return;
        }

        // now create tables
        function createNextTable(i) {
          if (i < schemas.length) {
            createClient.query(schemas[i], function(err) {
              if (err) {
                logUnexpectedError(err);
                return cb(err); // XXX why does mysql.js not return here???
              } else {
                createNextTable(i+1);
              }
            });
          } else {
            createClient.close(function(err) {
              if (err) {
                logUnexpectedError(err);
                return cb(err); // XXX why does mysql.js not return here???
              } else {
                doConnect();
              }
            });
          }
        }
        createNextTable(0);
      });
    });
  } else {
    doConnect();
  }
}
exports.close = function(cb) {
  client.close(function(err) {
    client = undefined;
    if (err) logUnexpectedError(err);
    if (cb) cb(err);
  });
}
exports.closeAndRemove = function(cb) {
  var db_to_remove = client.database;

  // don't let this happen if the name of the database is 'browserid',
  // as a sanity check
  if (db_to_remove === 'browserid') {
    throw "dropping a database named 'browserid' is not allowed";
  }

  client.query("DROP KEYSPACE " + db_to_remove, function(err) {
    if (err) logUnexpectedError(err);
    exports.close(cb);
  });
};

exports.emailKnown = function(email, cb) {
  client.cql(
  "SELECT COUNT(*) FROM email WHERE address = ?", [ email ],
  function(err, response) {
    // TODO: egads, this is a painful client API
    var row = response[0];
    var col = row.get('count');
    cb(err, col && col.value);
  });
}

exports.userKnown = function(uid, cb) {
  var query = "SELECT passwd FROM user WHERE id = ?",
    args = [ uid ];
}

// uses user and email tables
exports.emailInfo = function(email, cb) {
  // given email, fetch passwd hash
  // and hang onto a bunch of other email fields.
  var query = "SELECT * from email where address = ?",
    args = [ email ],
    // using that info, we have the userid, so we can get the passwd:
    query2 = "SELECT passwd from user where userid = ?",
    args2 = [ uid ];
}

exports.emailType = function(email, cb) {
  var query = "SELECT type FROM email WHERE address = ?",
    args = [ email ];
}
exports.emailIsVerified = function(email, cb) {
  var query = "SELECT verified FROM email WHERE address = ?",
    args = [ email ];
}

exports.forgetIDP = function(domain, cb) {
  var query = "DELETE FROM idp WHERE domain = ?",
    args = [ domain ];
}
exports.updateIDPLastSeen  = function(domain, cb) {
  // CQL just updates if the entry already exists, nice
  var query = "INSERT INTO idp (domain, lastSeen) VALUES(?, NOW())",
    args = [ domain ];
}
exports.getIDPLastSeen = function(domain, cb) {
  // TODO lastSeen is a timestamp, handle accordingly
  var query = "SELECT lastSeen FROM idp WHERE domain = ?",
    args = [ domain ];
}

exports.isStaged = function(email, cb) {
  var query = "SELECT COUNT(*) FROM staged WHERE email = ?",
    args = [ email ];
}
exports.lastStaged = function(email, cb) {
  // TODO another timeuuid to manage
  var query = "SELECT ts FROM staged WHERE email = ?",
    args = [ email ];
}
exports.stageUser = function(email, hash, cb) {
  // TODO wrap in a call to secrets.generate, returning secret
  // in CQL, INSERT does an update if key exists, so we should be good here
  var query = "INSERT INTO staged (secret, new_acct, existing_user, email, passwd, ts) VALUES(?, ?, ?, ?, ?, NOW())",
    args = [secret, true, false, email, hash ],
    lookupQuery = "INSERT INTO staged_secret_to_email (secret, email) VALUES (?, ?)",
    lookupArgs = [secret, email];
}
exports.haveVerificationSecret = function(secret, cb) {
  var query = "SELECT count(*) FROM staged_secret_to_email WHERE secret = ?",
    args = [ secret ];
}
exports.emailForVerificationSecret = function(secret, cb) {
  // step 1, retrieve email from secret
  // step 2, retrieve other stuff from staged table.
  var query = "SELECT email FROM staged_secret_to_email WHERE secret = ?",
    args = [ secret ],
    query2 = "SELECT existing_user, passwd FROM staged WHERE email = ?",
    args2 = [ email ];
}
exports.authForVerificationSecret = function(secret, cb) {
  // step 1, retrieve email from secret
  // step 2, retrieve other stuff from staged table.
  var query = "SELECT email FROM staged_secret_to_email WHERE secret = ?",
    args = [ secret ],
    query2 = "SELECT existing_user, passwd FROM staged WHERE email = ?",
    args2 = [ email ];
}
exports.verificationSecretForEmail = function(email, cb) {
  var query = "SELECT secret FROM staged WHERE email = ?",
    args = [ email ];
}

function addEmailToUser(userID, email, type, cb) {
  // issue #170 - delete any old records with the same
  // email address.  this is necessary because
  // gotVerificationSecret is invoked both for
  // forgotten password flows and for new user signups.
  // TODO hide the multiple deletions/insertions inside some kind of abstraction
  var query = "DELETE FROM email WHERE address = ?",
    args = [ email ],
    query2 = "DELETE FROM email_user_to_address WHERE user = ? AND address = ?",
    args2 = [ userID, email ],
    query2 = "INSERT INTO email(user, address, type) VALUES(?, ?, ?)",
    args2 = [ userID, email, type ],
    query3 = "INSERT INTO email_user_to_address(user, address) VALUES(?, ?)",
    args3 = [ userID, email ]
}
function getAndDeleteRowForSecret(secret, cb) {
  // get the secret, then delete from both tables.
  // if the secret isn't found, deal.
  var query = "SELECT email FROM staged_secret_to_email WHERE secret = ?",  
    args = [ secret ],
    query2 = "SELECT * FROM staged WHERE email = ?",
    args2 = [ email ],
    query3 = "DELETE FROM staged WHERE email = ?",
    args3 = [ email ],
    query4 = "DELETE FROM staged_secret_to_email WHERE secret = ?",
    args4 = [ secret ];
  // whew, i think that's everything.
}

exports.completeCreateUser = function(secret, cb) {
  // getAndDeleteRowForSecret
    // dbutils.withType
        // finally, user creation query
        var query = "INSERT INTO user(id, passwd, lastPasswordReset, failedAuthTries) VALUES(NOW(), ?, NOW(), ?)",
          args = [o.passwd, 0 ]
}
exports.completeConfirmEmail = function(secret, cb) {
  // no new queries, just uses other function calls
}
exports.completePasswordReset = function(secret, password, cb) {
  // getAndDeleteRowForSecret
    // emailToUID
      // "flip the verification bit on all emails for the user other than the one just verified
      // TODO does CQL actually support all these keywords?
      var query = "UPDATE EMAIL SET verified = FALSE WHERE user = ? AND type = 'secondary' AND address != ?",
        args = [ uid, o.email ];
        // addEmailToUser
          // updatePassword
}
exports.addPrimaryEmailToAccount = function(uid, emailToAdd, cb) {
  // no new queries
}
exports.createUserWithPrimaryEmail = function(email, cb) {
  // "create a new user acct with no password"
  // but you still need to specify the id.
  var lastPasswordReset = now(),
    query = "INSERT INTO user(id, lastPasswordReset) VALUES(NOW(), ?)",
    args = [ lastPasswordReset ],
    // inside callback, so you can see the uid
      query2 = "INSERT INTO email(user, address, type) VALUES(?, ?, ?)",
      args2 = [ uid, email, 'primary' ],
      query3 = "INSERT INTO email_user_to_address(user, address) VALUES(?, ?)",
      args3 = [ uid, email ];
}
exports.emailsBelongToSameAccount = function(lhs, rhs, cb) {
  // let's just do two queries and compare results
  // TODO optimize if noticeably slow
  var query = query2 = "SELECT user FROM email WHERE address = ?",
    args = [ lhs ],
    args2 = [ rhs ];
}
exports.userOwnsEmail = function(uid, email, cb) {
  var query = "SELECT COUNT(*) FROM email_user_to_address WHERE address = ? AND user = ?",
    args = [ email, uid ];
}
exports.stageEmail = function(existing_user, new_email, hash, cb) {
  // wrap in secrets.generate call
  // not sure if overwrite_password is needed, since INSERT just updates in C*
  // if the entry already exists.
  var query = "INSERT INTO staged (secret, new_acct, existing_user, email, passwd, ts) VALUES (?, ?, ?, ?, ?, NOW())",
    args = [ secret, false, existing_user, new_email, hash ];
}
exports.emailToUID = function(email, cb) {
  var query = "SELECT user FROM email WHERE address = ?",
    args = [ email ];
}
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
    query += ", lastPasswordReset = NOW()";
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
exports.listEmails = function(uid, cb) {
  // TODO this is why we need a user_to_email lookup table.
  // when we add that table we'll need to correctly manage multiple inserts and deletes.
  var query = "SELECT address FROM email_user_to_address WHERE user = ?",
    args = [ uid ];
}
exports.emailLastUsedAs = function(email, cb) {
  var query = "SELECT type FROM email WHERE address = ?",
    args = [ email ];
}
const typeEnum = ['primary', 'secondary'];
exports.updateEmailLastUsedAs = function(email, type, cb) {
  if (typeEnum.indexOf(type) === -1) {
    process.nextTick(function () {
      cb('Invalid type for updating email.type');
    });
  } else {
    var query = "UPDATE email SET type = ? WHERE address = ?",
      args = [ type, email ];
  }
}
exports.removeEmail = function(authenticated_user, email, cb) {
  // userOwnsEmail
    var query = "DELETE FROM email WHERE address = ?",
      args = email,
      query2 = "DELETE FROM email_user_to_address WHERE user = ? AND address = ?",
      args2 = [ authenticated_user, email ];
}
// TODO this is gonna be slow. be certain it's an async deletion with sync UX confirmation
exports.cancelAccount = function(uid, cb) {
  // delete all emails belonging to user
  // delete all staged emails belonging to user
  // delete user

  // 1. list all emails belonging to user. (so we can delete them)
  // 2. list all staged emails belonging to user.
  // 3. list all staged email secrets belonging to user.

  // XXX i'm sure we can pass a list as ? instead of for-looping over the
  //     connection pool. just writing it out here to make sure i'm hitting
  //     all the tables properly.
  //
  // 4. for secret in secrets: DELETE FROM staged_secret_to_email WHERE secret = ?
  // 5. DELETE FROM staged_existingUser_to_email WHERE existing_user = ?
  // 6. for email in staged emails: DELETE FROM staged WHERE email = ?
  // 7. DELETE FROM email_user_to_address WHERE user = ?
  // 8. for email in emails: DELETE FROM email WHERE address = ?
  // 9. DELETE FROM user WHERE id = ?
}

exports.createUnverifiedUser = function(email, hash, cb) {
  var query = "INSERT INTO user(passwd, lastPasswordReset) VALUES(?, NOW())",
    args = [ hash ],
    // inside callback:
      query2 = "INSERT INTO email(user, address, verified) VALUES(?, ?, ?)",
      args2 = [ info.insertId, email, false ],
      // and now the extra tables. actually quite simple since we skip the
      // staged, staged_secret_to_email, and staged_existingUser_to_email tables
      query3 = "INSERT INTO email_user_to_address(user, address) VALUES(?, ?)",
      args3 = [ info.insertId, email ],
      // then call stageEmail
}
exports.addTestUser = function(email, hash, cb) {
  // same queries as createUnverifiedUser, I think.
}
exports.ping = function(cb) {}
