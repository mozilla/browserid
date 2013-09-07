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
 * TODO if we have multiple calls to remove/insert a record in multiple places,
 *      we either need to wrap errbacks in a retryish loop, or use something like
 *      transactions (BATCH?), or otherwise ensure data integrity across tables.
 * 
 * TODO add 'test_cassandra' to conf.env options and get unit tests working
 *
 * TODO we rely upon mysql being case-insensitive in its default behavior. i think
 *      cassandra does likewise (downcases everything), but need to doublecheck.
 *      this has consequences for email normalization.
 *
 * TODO migration script from mysql. idempotency would be nice, for re-running.
 *      this should be easy, since INSERT does an UPDATE if record exists.
 *
 * TODO figure out realtime migration--maybe put a splitter/fanout queue in
 *      front of mysql and C*? could just be a nodejs process, our write load is
 *      not that high.
 *
 * TODO tune the consistency level for certain queries. helenus has a default of
 *      QUORUM for the Thrift driver, not clear what the default is for CQL.
 *
 * TODO instead of sprinkling CQL all around here, maybe add another layer,
 *      to separate models and database statements more cleanly? this is really
 *      not the simplest code to work with. do this after initial migration.
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

// NOTE we use timeuuid for identifiers because it's super expedient and because cassandra
//      accepts JS Date objects as valid input for this data type.
const schemas = [
  "CREATE TABLE user (" +
    "id                timeuuid," +
    "emails            list<text>," +
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
    "emails list<text>," +
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


// helenus can't deserialize a list, so we have to do it ourselves (╯°□°)╯︵ ┻━┻
// https://github.com/simplereach/helenus/issues/113
// XXX list manipulation should be done in CQL, and *not* by serializing
//     and deserializing in JS. don't misinterpret why this func's here.
function parseList(listResponse, cb) {
  if (!listResponse || !listResponse.length) return cb(); // TODO how should we handle empty responses?
  var list = resp[0];
  if (!Buffer.isBuffer(list)) return cb("list must be of type buffer");
  // output will be of the form
  //   \u0000\u0003\u0000\u0013firstListEntry\u0000\u0013secondListEntry\u0000\u0013thirdListEntry'
  var parsed = list.toString('utf8');
  // output will be of the form
  //  ['\u0000\u0003', 'firstListEntry', ... ]
  var asArray = parsed.split('\u0000\u0013');
  // strip off the initial bit & return
  asArray.shift();
  return cb(null, asArray);
}

// let's abstract out this horrible complexity
// r: response object (an array of Rows)
function getValue(r, key) { return r && r[0] && r[0].get(key) && r[0].get(key).value }

// slightly different thing here.
// you can iterate over an array of rows via rows.forEach(function(row) { getRowValue(row, 'whatever') });
function getRowValue(row, key) { return row && row.get(key) && row.get(key).value }


// db connection queries. open also creates schema.
// this is purposely modeled closely after mysql.js to ease side-by-side
// code reviews. we can revise structure further out.
exports.open = function(cfg, cb) {
  if (client) throw "database is already open!";
  // cassandra config requires
  var options = {
    hosts: cfg.cassandra_hosts || ['localhost:9160'],
    user: cfg.user,
    password: cfg.password,
    cqlVersion: cfg.cassandra_cql_version || '3.0.0'
  };

  // let's figure out the keyspace name
  var keyspace = cfg.name;
  if (!keyspace) keyspace = "browserid";

  // TODO this is new in C*, add to config.js
  var keyspaceProperties = cfg.cassandra_keyspace_properties || "{'class': 'SimpleStrategy', 'replication_factor': 1}";

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
                cb(err);
              } else {
                createNextTable(i+1);
              }
            });
          } else {
            createClient.close(function(err) {
              if (err) {
                logUnexpectedError(err);
                cb(err);
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

  client.cql("DROP KEYSPACE " + db_to_remove, function(err) {
    if (err) logUnexpectedError(err);
    exports.close(cb);
  });
};

exports.emailKnown = function(email, cb) {
  client.cql(
    "SELECT COUNT(*) FROM email WHERE address = ?", [ email ],
    function(err, response) {
      var col = getValue(response, 'count')
      cb(err, col);
    }
  );
}

exports.userKnown = function(uid, cb) {
  client.cql(
    "SELECT passwd FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      var known = resp && resp.length > 0;
      var pass = getValue(resp, 'passwd');
      var hasPass = (typeof pass == 'string' && pass.length > 0);
      cb(err, known, hasPass);
    }
  );
}

// lib/wsapi/address_info expects a response of the form:
// { lastUsedAs: (type),
//   normalizedEmail: (address downcased in DB),
//   verified: (is verified),
//   hasPassword: (password hash)
// }
exports.emailInfo = function(email, cb) {
  client.cql(
    "SELECT * from email where address = ?", [ email ],
    function(err, resp) {
      if (err) return cb(err);
      var uid = getValue(resp, 'user'),
        o = {
          lastUsedAs: getValue(resp, 'type'),
          normalizedEmail: getValue(resp, 'address'),
          verified: getValue(resp, 'verified')
        };
      client.cql(
        "SELECT passwd FROM user WHERE id = ?", [ uid ],
        function(err, resp2) {
          cb(err, o['hasPassword'] = getValue(resp2, 'passwd'));
        }
      );
    }
  );
}

exports.emailType = function(email, cb) {
  client.cql(
    "SELECT type FROM email WHERE address = ?", [ email ],
    function(err, resp) {
      cb(err, getValue(resp, 'type'));
    }
  );
}

exports.emailIsVerified = function(email, cb) {
  client.cql(
    "SELECT verified FROM email WHERE address = ?", [ email ],
    function(err, resp) {
      if (resp && resp.length > 0) cb(err, !!getValue(resp, 'verified'));
      else cb('no such email');
    }
  );
}

// TODO should we abstract away, eg, HelenusInvalidRequestException vs
//      whatever the funky exception is that's thrown by mysql?
exports.forgetIDP = function(domain, cb) {
  client.cql("DELETE FROM idp WHERE domain = ?", [ domain ], cb);
}

exports.updateIDPLastSeen  = function(domain, cb) {
  // CQL just updates if the entry already exists, nice
  client.cql("INSERT INTO idp (domain, lastSeen) VALUES(?, NOW())", [ domain ], cb);
}

exports.getIDPLastSeen = function(domain, cb) {
  client.cql(
    "SELECT unixTimestampOf(lastSeen) FROM idp WHERE domain = ?", [ domain ],
    function(err, resp) {
      if (err) { cb(err); }
      else if (resp && resp.length > 0) {
        var lastSeen = getValue(resp, 'unixTimestampOf(lastpasswordreset)'); // NB: keys are lowercased by cassandra
        cb(err, new Date(lastSeen));
      }
      else cb(null, null);
    }
  );
}

exports.isStaged = function(email, cb) {
  client.cql(
    "SELECT COUNT(*) FROM staged WHERE email = ?", [ email ],
    function(err, resp) {
      var count = getValue(resp, 'count');
      cb(err, typeof count == 'number' && count > 0);
    }
  );
}

exports.lastStaged = function(email, cb) {
  client.cql(
    "SELECT unixTimestampOf(ts) FROM staged WHERE email = ?", [ email ],
    function(err, resp) {
      var lastStagedTime = getValue(resp, 'unixTimestampOf(ts)');
      if (err) cb(err);
      else if (!resp || resp.length === 0) cb(null);
      else cb(null, new Date(lastStagedTime));
    }
  );
}

exports.stageUser = function(email, hash, cb) {
  secrets.generate(48, function(secret) {
    // in CQL, INSERT does an update if key exists, so we should be good here
    client.cql(
      "INSERT INTO staged (secret, new_acct, existing_user, email, passwd, ts) VALUES(?, ?, ?, ?, ?, NOW())",
      args = [secret, true, false, email, hash ],
      function(err) {
        if (err) return cb(err);
        client.cql(
          "INSERT INTO staged_secret_to_email (secret, email) VALUES (?, ?)",
          [ secret, email ],
          function(er2) {
            cb(er2, er2 ? undefined : secret);
          }
        );
      }
    );
  });
}

exports.haveVerificationSecret = function(secret, cb) {
  client.cql(
    "SELECT count(*) FROM staged_secret_to_email WHERE secret = ?", [ secret ],
    function(err, resp) {
      var secretCount = getValue(resp, 'count');
      cb(err, secretCount && secretCount === 1);
    }
  );
}

exports.emailForVerificationSecret = function(secret, cb) {
  // step 1, retrieve email from secret
  // step 2, retrieve other stuff from staged table.
  // XXX being extremely careful to preserve specific err messages in this case
  client.cql(
    "SELECT email FROM staged_secret_to_email WHERE secret = ?", [ secret ],
    function(err, resp) {
      if (err) return cb("database unavailable"); // TODO why does mysql.js say "database unavailable" in errback here?
      var email = getValue(resp, 'email');
      if (!email) return cb("no such secret"); // seems misleading but is correct if you look at the two err msgs in mysql.js
      client.cql(
        "SELECT existing_user, passwd FROM staged WHERE email = ?", [ email ],
        function(er2, resp2) {
          if (er2) return cb("database unavailable"); // TODO ditto.

          // if the record was not found, fail out
          if (!resp2 || resp2.length !== 1) return cb("no such secret"); // TODO ditto again.

          cb(null, email, getValue(resp2, 'existing_user'), getValue(resp2, 'passwd'));
        }
      );
    }
  );
}
exports.authForVerificationSecret = function(secret, cb) {
  // step 1, retrieve email from secret
  // step 2, retrieve other stuff from staged table.
  client.cql(
    "SELECT email FROM staged_secret_to_email WHERE secret = ?", [ secret ],
    function(err, resp) {
      if (err) return cb("database unavailable"); // TODO why does mysql.js say "database unavailable" in this errback too?
      var email = getValue(resp, 'email');
      if (!email) return cb("no password for user"); // seems misleading but is correct if you look at the err msgs in mysql.js
      client.cql(
        "SELECT existing_user, passwd FROM staged WHERE email = ?", [ email ],
        function(er2, resp2) {
          if (er2) return cb("database unavailable");

          // if the record was not found, fail out
          if (!resp2 || resp2.length !== 1) return cb("no password for user");

          var passwd = getValue(resp2, 'passwd');
          var existing_user = getValue(resp2, 'existing_user');

          // if there is a hashed passwd in the result, we're done
          if (passwd) return cb(null, passwd, existing_user, true);

          // otherwise, let's get the passwd from the user record
          if (!existing_user) return cb("no password for user");

          exports.checkAuth(existing_user, function(err, hash) {
            // fourth parameter indicates that there was no
            // password in the stage table
            cb(err, hash, existing_user, false);
          });
        }
      );
    }
  );
}

exports.verificationSecretForEmail = function(email, cb) {
  client.cql(
    "SELECT secret FROM staged WHERE email = ?", [ email ],
    function(err, resp) {
      cb(err, getValue(resp, 'secret'));
    }
  );
}

// XXX userID may be specified as JS Date
function addEmailToUser(userID, email, type, cb) {
  // issue #170 - delete any old records with the same
  // email address.  this is necessary because
  // gotVerificationSecret is invoked both for
  // forgotten password flows and for new user signups.

  // XXX so, here's the thing. issue #170 comment is irrelevant in the
  //     world where the email table is keyed on the email, not on some
  //     arbitrary integer identifier. So none of that is necessary.
  client.cql(
    "UPDATE user SET emails = emails + [ ? ] WHERE id = ?", [ email, userID ],
    function(err) {
      if (err) {
        logUnexpectedError(err);
        return cb(err);
      }
      client.cql(
        "INSERT INTO email(user, address, type) VALUES(?, ?, ?)", [ userID, email, type ],
        function(err) {
          if (err) {
            logUnexpectedError(err);
            return cb(err)
          } 
          cb(null, email, userID);
        }
      );
    }
  );
}

function getAndDeleteRowForSecret(secret, cb) {
  // get the secret, then delete from both tables.
  // if the secret isn't found, deal.
  client.cql(
    "SELECT email FROM staged_secret_to_email WHERE secret = ?", [ secret ],
    function(err, resp) {
      if (err) {
        logUnexpectedError(err);
        return cb(err);
      }
      var email = getValue(resp, 'email');
      if (!email) { return cb("unknown secret") } // TODO once again, reusing existing err messages in odd spots for continuity's sake. sigh
      client.cql(
        "SELECT * FROM staged WHERE email = ?", [ email ],
        function(er2, resp2) {
          if (er2) {
            logUnexpectedError(er2);
            return cb(er2);
          }
          if (!resp2) { return cb("unknown secret") }
          client.cql(
            "DELETE FROM staged WHERE email = ?", [ email ],
            function(er3) {
              if (er3) {
                logUnexpectedError(er3);
                return cb(er3);
              }
              client.cql(
                "DELETE FROM staged_secret_to_email WHERE secret = ?", [ secret ],
                function(er4) {
                  // TODO expected output format correct? rows[0] => 'select * from staged'
                  // staged in mysql: id, secret, new_acct, existing_user, email, passwd, ts.
                  var o = {
                    id: getValue(resp2, 'id'),
                    secret: secret,
                    new_acct: getValue(resp2, 'new_acct'),
                    existing_user: getValue(resp2, 'existing_user'),
                    email: email,
                    passwd: getValue(resp2, 'passwd'),
                    ts: getValue(resp2, 'ts')
                  };
                  cb(er4, o);
                }
              );
            }
          );
        }
      );
    }
  );
}

exports.completeCreateUser = function(secret, cb) {
  getAndDeleteRowForSecret(secret, function(err, o) {
    if (err) return cb(err);

    if (!o.new_acct) return cb("this verification link is not for a new account");
    dbutils.withType(o.email, function(type) {
      // we're creating a new account, add appropriate entries into user and email tables.

      // generate the id client-side to ease addEmailToUser call
      var id = now();
      client.cql(
        "INSERT INTO user(id, passwd, lastPasswordReset, failedAuthTries) VALUES(?, ?, NOW(), ?)", [ id, o.passwd, 0 ],
        function(err, resp) {
          if (err) return cb(err);
          addEmailToUser(id, o.email, type, cb);
        }
      );
    });
  });
}

// TODO this actually came over identical to the fucntion in mysql.js.
//      maybe give it a hard second look.
exports.completeConfirmEmail = function(secret, cb) {
  getAndDeleteRowForSecret(secret, function(err, o) {
    if (err) return cb(err);

    if (o.new_acct) return cb("this verification link is not for an email addition");

    // ensure the expected existing_user field is populated, which it must always be when
    // new_acct is false
    if (typeof o.existing_user !== 'number') {
      return cb("data inconsistency, no numeric existing user associated with staged email address");
    }

    dbutils.withType(o.email, function (type) {
      // we're adding or reverifying an email address to an existing user account.  add appropriate
      // entries into email table.
      if (o.passwd) {
        exports.updatePassword(o.existing_user, o.passwd, false, function(err) {
          if (err) return cb('could not set user\'s password');
          addEmailToUser(o.existing_user, o.email, type, cb);
        });
      } else {
        addEmailToUser(o.existing_user, o.email, type, cb);
      }
    });
  });
}

exports.completePasswordReset = function(secret, password, cb) {
  getAndDeleteRowForSecret(secret, function(err, o) {
    if (err) return cb(err);

    if (o.new_acct || (!password && !o.passwd) || !o.existing_user) {
      return cb("this verification link is not for a password reset");
    }

    // verify that the email still exists in the database, and the the user with whom it is
    // associated is the same as the user in the database
    exports.emailToUID(o.email, function(err, uid) {
      if (err) return cb(err);

      // if for some reason the email is associated with a different user now than when
      // the action was initiated, error out.
      if (uid !== o.existing_user) {
        return cb("cannot update password, data inconsistency");
      }

      // flip the verification bit on all emails for the user other than the one just verified
      // first query: get the list of emails
      client.cql(
        "SELECT emails FROM user WHERE id = ?", [ user ],
        function(err, resp) {
          if (err || !resp) { return cb(err || "no emails found belonging to user"); }

          // now, exclude the just-updated email
          parseList(resp, function(err, allEmails) {
            var i = allEmails.indexOf(o.email);
            allEmails.splice(i, 1);

            // second query: for all those other than the one just verified, flip the verification bit
            client.cql(
              "UPDATE email SET verified = false WHERE address IN ?", [ allEmails ],
              function(err) {
                if (err) return cb(err);

                // mark this address as verified
                addEmailToUser(uid, o.email, 'secondary', function(err){
                  if (err) return cb(err);

                  // update the password!
                  exports.updatePassword(uid, password || o.passwd, true, function(err) {
                    cb(err, o.email, uid);
                  });
                });
              }
            );
          });
        }
      );
    });
  });
}

exports.addPrimaryEmailToAccount = function(uid, emailToAdd, cb) {
  // we're adding an email address to an existing user account.  add appropriate entries into
  // email table
  addEmailToUser(uid, emailToAdd, 'primary', cb);
}

exports.createUserWithPrimaryEmail = function(email, cb) {
  // create a new user acct with no password
  // note, we can insert an ISO datetime instead of a timeuuid, super convenient
  var currentTime = uid = now();
  client.cql(
    "INSERT INTO user(id, lastPasswordReset, emails) VALUES(?, ?, ?)", [ uid, currentTime, [email] ],
    function(err) {
      if (err) return cb(err);
      client.cql(
        "INSERT INTO email(user, address, type) VALUES(?, ?, ?)", [ uid, email, 'primary' ],
        function(err) {
          cb(err, uid, lastPasswordReset);
        }
      );
    }
  );
}

exports.emailsBelongToSameAccount = function(lhs, rhs, cb) {
  // let's just do two queries and compare results
  // TODO what if two local nodes are inconsistent? need LOCAL_QUORUM, methinks
  var lhsUser, rhsUser;
  client.cql(
    "SELECT user FROM email WHERE address = ?", [ lhs ],
    function(err, resp) {
      if (err) return cb(err);
      lhsUser = getValue(resp, 'user');
      client.cql(
        "SELECT user FROM email WHERE address = ?", [ rhs ],
        function(err, resp) {
          if (err) return cb(err);
          rhsUser = getValue(resp, 'user');
          cb(err, lhsUser && rhsUser && lhsUser === rhsUser);
        }
      );
    }
  );
}

exports.userOwnsEmail = function(uid, email, cb) {
  client.cql(
    "SELECT emails FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      if (err) return cb(err);
      if (!resp.length) return cb(null, false);
      parseList(resp, function(err, emails) {
        cb(err || !emails, emails && emails.length && emails.indexOf(email) !== -1);
      });
    }
  );
}

// TODO needs QUORUM
exports.stageEmail = function(existing_user, new_email, hash, cb) {
  secrets.generate(48, function(secret) {
    // overwrite_password is used in mysql.js but refers to "old flow" which is
    // probably not relevant by now? TODO investigate
    client.cql(
      "INSERT INTO staged (secret, new_acct, existing_user, email, passwd, ts) VALUES (?, ?, ?, ?, ?, NOW())",
      [ secret, false, existing_user, new_email, hash ],
      function(err) {
        if (err) return cb(err);
        client.cql(
          "INSERT INTO staged_secret_to_email (secret, email) VALUES (?, ?)", [ secret, new_email ],
          function(err) {
            cb(err, err ? undefined : secret);
          }
        );
      }
    );
  });
}

exports.emailToUID = function(email, cb) {
  client.cql(
    "SELECT user FROM email WHERE address = ?", [ email ],
    function(err, resp) {
      cb(err, getValue(resp, 'user'));
    }
  );
}

exports.checkAuth = function(uid, cb) {
  client.cql(
    "SELECT passwd, failedAuthTries FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      cb(err, getValue(resp, 'passwd'), getValue(resp, 'failedAuthTries'));
    }
  );
}

exports.lastPasswordReset = function(uid, cb) {
  // TODO doublecheck this returns unix timestamp (seconds) not milliseconds
  //      it's possible this doesn't matter, need to investigate
  client.cql(
    "SELECT unixTimestampOf(lastPasswordReset) FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      var lastSeen = getValue(resp, 'unixTimestampOf(lastpasswordreset)'); // NB: keys are lowercased by cassandra
      cb(err, lastSeen);
    }
  );
}

exports.updatePassword = function(uid, hash, invalidateSessions, cb) {
  // upon password update we'll always update the hash and reset 'failedAuthTries'
  var query = "UPDATE user SET passwd = ?, failedAuthTries = '0'",
    args = [ hash ];
  // if invalidateSessions is specified, we'll update the lastPasswordReset field
  // which will end all outstanding sessions for this user
  if (invalidateSessions) {
    query += ", lastPasswordReset = NOW()";
  }
  // finally, we always have the where clause.
  query += " WHERE id = ?";
  args.push(uid);

  client.cql(
    query, args,
    function(err, resp) {
      // TODO how to verify that the record existed? see mysql.js#updatePassword.
      // cassandra 2.0 gives us UPDATE IF, till then it's read-then-write :-\
      cb(err);
    }
  );
}

exports.clearAuthFailures = function(uid, cb) {
  client.cql(
    "UPDATE user SET failedAuthTries = 0 WHERE id = ?", [ uid ],
    function(err) {
      // TODO how to verify that the user existed?
      cb(err);
    }
  );
}

exports.incAuthFailures = function(uid, cb) {
  // TODO read-then-write spells your doom, young skywalker. use LOCAL_QUORUM at least.
  // It is unfortunate that counters can't be reset to zero, or we could just use those.
  client.cql(
    "SELECT failedAuthTries FROM user WHERE id = ?", [ uid ],
    function(err, count) {
      if (err) return cb(err);
      client.cql(
        "UPDATE user SET failedAuthTries = ? WHERE id = ?", [ count+1, uid ],
        cb
      )
    }
  );
}

/*
 * list the user's emails.
 *
 * returns an object keyed by email address with properties for each email.
 */
exports.listEmails = function(uid, cb) {
  client.cql(
    "SELECT emails FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      if (err) return cb(err);
      parseList(resp, function(err, emails) {
        return cb(err, emails);
      })
    }
  );
}

exports.emailLastUsedAs = function(email, cb) {
  client.cql(
    "SELECT type FROM email WHERE address = ?", [ email ],
    function(err, resp) {
      // TODO mysql.js has a weird "if rows.length != 1" case. wtf is that about?
      cb(err, getValue(resp, 'type'));
    }
  );
}

const typeEnum = ['primary', 'secondary'];
exports.updateEmailLastUsedAs = function(email, type, cb) {
  if (typeEnum.indexOf(type) === -1) {
    process.nextTick(function () {
      cb('Invalid type for updating email.type');
    });
  } else {
    client.cql(
      "UPDATE email SET type = ? WHERE address = ?", [ type, email ],
      // TODO mysql.js just uses cb as the callback to the mysql driver.
      //      ensure callers of this function aren't expecting a mysql row etc.
      function(err) {
        cb(err);
      }
    );
  }
}

exports.removeEmail = function(authenticated_user, email, cb) {
  exports.userOwnsEmail(authenticated_user, email, function(err, ok) {
    if (err) return cb(err); 

    if (!ok) {
      logger.warn(authenticated_user + ' attempted to delete an email that doesn\'t belong to her: ' + email);
      cb("authenticated user doesn't have permission to remove specified email " + email);
      return;
    }

    client.cql(
      "DELETE FROM email WHERE address = ?", [ email ],
      function(err) {
        if (err) return cb(err);
        client.cql(
          "UPDATE user SET emails = emails - ? WHERE id = ?", [ [email], authenticated_user ],
          function(err) {
            cb(err);
          }
        );
      }
    );
  });
}

exports.cancelAccount = function(uid, cb) {
  // delete all emails belonging to user
  // delete all staged emails belonging to user
  // delete user

  // 1. list all emails belonging to user. (so we can delete them)
  exports.listEmails(uid, function(err, emailsToDelete) {
    // 2. delete them
    client.cql(
      "DELETE FROM email WHERE address IN ( ? )", [ emailsToDelete ],
      function(err) {
        // 3. get all staged emails belonging to user
        client.cql(
          "SELECT emails FROM staged_existingUser_to_email WHERE existing_user = ? ",
          [ uid ],
          function(err, resp) {
            parseList(resp, function(err, stagedEmails) {
              // get all secrets corresponding to staged emails
              client.cql(
                "SELECT secret FROM staged WHERE email IN ( ? )", [ stagedEmails ],
                function(err, stagedSecrets) {
                  var secrets = [];
                  stagedSecrets.forEach(function(row) {
                    secrets.push(getRowValue(row, 'secret'));
                  });
                  // delete all staged emails belonging to user
                  client.cql(
                    "DELETE FROM staged WHERE email IN ( ? )", [ stagedEmails ],
                    function(err) {
                      // delete all secret->email entries 
                      client.cql(
                        "DELETE FROM staged_secret_to_email WHERE secret IN ( ? )", [ secrets ],
                        function(err) {
                          // delete existing_user->staged entries
                          client.cql(
                            "DELETE FROM staged_existingUser_to_email WHERE existing_user = ? ", [ uid ],
                            function(err) {
                              // finally, delete user
                              client.cql(
                                "DELETE FROM user WHERE id = ?", [ uid ],
                                function(err) {
                                  cb(err);
                                }
                              );
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            });  // ♫  o christmas tree ♫ 
          }
        );
      }
    );
  });
}

exports.createUnverifiedUser = function(email, hash, cb) {
  var uid = now(); // using Date for uuid
  client.cql(
    "INSERT INTO user(id, passwd, lastPasswordReset, email) VALUES(?, ?, ?, ?)",
    [ uid, hash, uid, email ],
    function(err) {
      client.cql(
        "INSERT INTO email(user, address, verified) VALUES(?, ?, ?)", [ uid, email, false ],
        function(err) {
          if (err) {
            logUnexpectedError(err);
            return cb(err);
          }
          exports.stageEmail(uid, email, hash, function(err, secret) {
            cb(err, uid, secret);
          });
        }
      );
    }
  );
}

exports.addTestUser = function(email, hash, cb) {
  var uid = now();
  client.cql(
    "INSERT INTO user(id, passwd, lastPasswordReset, email) VALUES(?, ?, ?, ?)",
    [ uid, hash, uid, email ],
    function(err) {
      client.cql(
        "INSERT INTO email(user, address) VALUES(?, ?)", [ uid, email ],
        function(err) {
          if (err) logUnexpectedError(err);
          cb(err, err ? null : email);
        }
      );
    }
  );
}
// TODO we shouldn't be relying on a node process to manage DB health checks.
//      let's remove the code which relies on this, and monitor the DB properly.
//      for the moment, it's a no-op which reminds us not to deploy it by erroring.
exports.ping = function(cb) { cb('ping function not implemented') };
