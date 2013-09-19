/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * first draft cassandra driver for browserid. a fairly direct port
 * of the mysql schema, adding lookup tables where additional indexed
 * columns are present in the mysql schema.
 */

/* ridiculously high-level TODOs:
 *
 * TODO we are using atomic batches. there is a 15-30% performance penalty
 *      for atomicity. if we need to optimize write performance, this might
 *      be a leading term to attempt to optimize.
 * 
 * TODO add 'test_cassandra' to conf.env options and get unit tests working
 *
 * TODO I'm skeptical about wtf the "connection pool" behavior in the client
 *      is really doing. maybe stop using this and use individual conns instead?
 *
 * TODO we rely upon mysql being case-insensitive in its default behavior, eg
 *      in doing case-insensitive email comparisons. If emails are stored as
 *      serialized lists, I'm not sure that's going to happen on the server any
 *      longer. 
 *
 * TODO migration script from mysql. idempotency would be nice, for re-running.
 *      this *should* be easy, since INSERT does an UPDATE if record exists.
 *
 * TODO can't figure out how to access v1(timeuuid) and v4(uuid) from cassandra
 *      driver. although a 'types' object is exported by the module, it doesn't
 *      expose methods to *generate* uuids of either type, and it converts Dates
 *      to the Timestamp type, which is a crap choice from Cassandra's pov, as
 *      regular timestamps can easily clash when used as a primary key in a large
 *      distributed cluster.
 *      big question: are v1 uuids generated in JS going to really match the quirks
 *      in the v1 uuid implementation inside C*? i'm skeptical.
 *
 * TODO figure out realtime migration--maybe put a splitter/fanout queue in
 *      front of mysql and C*? could just be a nodejs process, our write load is
 *      not that high.
 *
 * TODO tune the consistency level for certain queries. node-cass-cql has a default of
 *      QUORUM for the CQL client--shouldn't this be LOCAL_QUORUM for most reads?
 *
 * TODO instead of sprinkling CQL all around here, maybe add another layer,
 *      to separate models and database statements more cleanly? this is really
 *      not the simplest code to work with. do this after initial migration.
 *
 * TODO replace christmas tree code with flow control. also after initial migration.
 */

const
conf = require('../configuration.js'),
dbutils = require('./dbutils.js'),
cassandra = require('node-cassandra-cql'),
uuid = require('node-uuid'),
logger = require('../logging.js').logger,
primary = require('../primary.js'),
secrets = require('../secrets.js');

var client;


/*
 * CQL3 Schema:
 */

const schemas = [
  "CREATE TABLE user (" +
    "id                uuid," +
    "emails            list<text>," +
    "passwd            varchar," +
    "lastPasswordReset timeuuid," +
    "failedAuthTries   int," +
    "PRIMARY KEY (id)" +
  ");",

  /* do we need to identify emails with a uuid? the address is a better partition key. */
  "CREATE TABLE email (" +
    "address varchar," +
    "user uuid," +
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
    "existing_user uuid," +
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
    "existing_user uuid," +
    "emails list<text>," +
    "PRIMARY KEY (existing_user)" +
  ");"


];

function now() { return uuid.v1(); }
function generateUserID() { return uuid.v4(); }
function logUnexpectedError(detail) {
  // first, get line number of callee
  var where;
  try { dne; } catch (e) { where = e.stack.split('\n')[2].trim(); }
  // now log it!
  logger.warn("unexpected database failure: " + detail + " -- " + where);
}

/*
  r: response object of the form
  r = {
    meta: {
      global_tables_spec: true,
      keyspace: 'browserid',
      table: 'staged_secret_to_email',
      columns: [ [Object], _col_email: 0 ]
    },
    rows: [ [ 'foo@bar.com', columns: [Object], get: [Function] ] ]
  }

  if lookup fails, rows = [].
  so, rows[0] may not exist, and calling `rows[0].get('email')` may throw.
*/
function getValue(r, key) { return r && r.rows && r.rows[0] && r.rows[0].get(key) }

// slightly different thing here.
// you can iterate over an array of rows via
//   resp.rows.forEach(function(row) { getRowValue(row, 'whatever') });
function getRowValue(row, key) { return row && row.get(key) }


// db connection queries. open also creates schema.
// this is purposely modeled closely after mysql.js to ease side-by-side
// code reviews. we can revise structure further out.
exports.open = function(cfg, cb) {
  if (client) throw "database is already open!";
  // cassandra config requires
  // TODO add support for add'l timeouts: staleTime, maxExecuteRetries
  // TODO figure out why 'localhost:9160' was failing with this client
  var options = {
    hosts: cfg.cassandra_hosts || ['localhost'],
    user: cfg.user,
    password: cfg.password,
    getAConnectionTimeout: cfg.max_query_time || 5000,
    cqlVersion: cfg.cassandra_cql_version || '3.0.0'
  };

  // let's figure out the keyspace name
  var keyspace = cfg.name;
  if (!keyspace) keyspace = "browserid";

  // TODO this is new in C*, add to config.js
  var keyspaceProperties = cfg.cassandra_keyspace_properties || "{'class': 'SimpleStrategy', 'replication_factor': 1}";

  // create the client
  function doConnect() {
    if (!client) {
      logger.debug("connecting to cassandra: " + keyspace);
      options.keyspace = keyspace;
      // TODO add to config.js. pool size is a guess.
      options.hostPoolSize = 5;
      client = new cassandra.Client(options);

    }
    client.connect(function(err) {
      logger.debug("connection to cassandra " + (err ? ("fails: " + err) : "established"));
      if (err) { return cb(err) }
      logger.debug("about to USE the browserid keyspace");
      client.execute("USE " + keyspace, function(err) {
        if (err) logger.debug("couldnt use the browserid keyspace: " + err)
        else logger.debug("used the browserid keyspace")
        cb(err)
      });
    });
  }

  // TODO this structure makes me yearn for promises, but it works
  // for the initial port to C*.
  // TODO should we drop keyspace first?
  // TODO should we ignore failures when trying to create already existing tables?
  //      errors of the form: Cannot add already existing column family "foo" to keyspace "browserid"
  if (cfg.create_schema) {
    logger.debug("creating keyspace and tables if required");
    logger.debug("options bundle is : " + JSON.stringify(options))
    client = new cassandra.Client(options);
    client.connect(function(err) {
      if (err) {
        logUnexpectedError(err);
        return cb(err);
      }
      logger.debug("creating keyspace");
      client.execute("CREATE KEYSPACE " + keyspace + " WITH replication = " + keyspaceProperties, function(err) {
        // TODO when we move to Cassandra 2.0, add 'IF NOT EXISTS'. for now checking manually.
        if (err && err.message.indexOf('Cannot add existing keyspace') === -1) {
          // oh shit, it's a real error.
          logUnexpectedError(err);
          cb(err);
          return;
        }
        logger.debug("using keyspace");
        client.execute("USE " + keyspace, function(err) {
          if (err) {
            logUnexpectedError(err);
            cb(err);
            return;
          }

          // now create tables
          function createNextTable(i) {
            if (i < schemas.length) {
              logger.debug("now creating table " + schemas[i]);
              client.execute(schemas[i], function(err) {
                // if the table already exists, just keep moving
                if (err && err.message.indexOf('Cannot add already existing column family') === -1) {
                  logUnexpectedError(err);
                  cb(err);
                } else {
                  createNextTable(i+1);
                }
              });
            } else {
              doConnect();
            }
          }
          createNextTable(0);
        });
      });
    });
  } else {
    doConnect();
  }
}

exports.close = function(cb) {
  client.shutdown(function(err) {
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

  client.execute("DROP KEYSPACE " + db_to_remove, function(err) {
    if (err) logUnexpectedError(err);
    exports.close(cb);
  });
};

exports.emailKnown = function(email, cb) {
  client.execute(
    "SELECT COUNT(*) FROM email WHERE address = ?", [ email ],
    function(err, response) {
      var count = Number(getValue(response, 'count'));
      cb(err, !isNaN(count) && count > 0);
    }
  );
}

exports.userKnown = function(uid, cb) {
  client.execute(
    "SELECT passwd FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      var known = resp && resp.rows.length > 0;
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
  client.execute(
    "SELECT * from email where address = ?", [ email ],
    function(err, resp) {
      if (err) return cb(err);
      if (!resp || !resp.rows.length) { return cb(err, null) }
      var uid = getValue(resp, 'user'),
        o = {
          lastUsedAs: getValue(resp, 'type'),
          normalizedEmail: getValue(resp, 'address'),
          verified: getValue(resp, 'verified')
        };
      logger.debug("DB::emailInfo: uid is " + uid);
      client.execute(
        "SELECT passwd FROM user WHERE id = ?", [ uid ],
        function(err, resp2) {
          o['hasPassword'] = !!getValue(resp2, 'passwd');
          cb(err, o);
        }
      );
    }
  );
}

exports.emailType = function(email, cb) {
  client.execute(
    "SELECT type FROM email WHERE address = ?", [ email ],
    function(err, resp) {
      cb(err, getValue(resp, 'type'));
    }
  );
}

exports.emailIsVerified = function(email, cb) {
  client.execute(
    "SELECT verified FROM email WHERE address = ?", [ email ],
    function(err, resp) {
      if (resp && resp.rows.length > 0) cb(err, !!getValue(resp, 'verified'));
      else cb('no such email');
    }
  );
}

exports.forgetIDP = function(domain, cb) {
  client.execute("DELETE FROM idp WHERE domain = ?", [ domain ], cb);
}

exports.updateIDPLastSeen  = function(domain, cb) {
  // CQL just updates if the entry already exists, nice
  client.execute("INSERT INTO idp (domain, lastSeen) VALUES(?, ?)", [ domain, now() ], cb);
}

exports.getIDPLastSeen = function(domain, cb) {
  client.execute(
    "SELECT unixTimestampOf(lastSeen) FROM idp WHERE domain = ?", [ domain ],
    function(err, resp) {
      if (err) { cb(err); }
      else if (resp && resp.rows.length > 0) {
        var lastSeen = Number(getValue(resp, 'unixTimestampOf(lastseen)')); // NB: keys are lowercased by cassandra, but not function names
        cb(err, new Date(lastSeen));
      }
      else cb(null, null);
    }
  );
}

exports.isStaged = function(email, cb) {
  client.execute(
    "SELECT COUNT(*) FROM staged WHERE email = ?", [ email ],
    function(err, resp) {
      var count = Number(getValue(resp, 'count'));
      cb(err, !isNaN(count) && count > 0);
    }
  );
}

exports.lastStaged = function(email, cb) {
  client.execute(
    "SELECT unixTimestampOf(ts) FROM staged WHERE email = ?", [ email ],
    function(err, resp) {
      var lastStagedTime = Number(getValue(resp, 'unixTimestampOf(ts)'));
      if (err) cb(err);
      else if (!resp || resp.length === 0) cb(null);
      else cb(null, new Date(lastStagedTime));
    }
  );
}

exports.stageUser = function(email, hash, cb) {
  secrets.generate(48, function(secret) {
    // in CQL, INSERT does an update if key exists, so we should be good here
    var query = "BEGIN BATCH" +
      " INSERT INTO staged (secret, new_acct, existing_user, email, passwd, ts) VALUES(?, ?, ?, ?, ?, ?)" +
      " INSERT INTO staged_secret_to_email (secret, email) VALUES (?, ?)" +
      " APPLY BATCH",
      args = [secret, true, null, email, hash, now(), secret, email ];
    client.execute(query, args, 
      function(err) {
        cb(err, err ? undefined : secret);
      }
    );
  });
}

exports.haveVerificationSecret = function(secret, cb) {
  client.execute(
    "SELECT count(*) FROM staged_secret_to_email WHERE secret = ?", [ secret ],
    function(err, resp) {
      var secretCount = Number(getValue(resp, 'count'));
      cb(err, !isNaN(secretCount) && secretCount === 1);
    }
  );
}

exports.emailForVerificationSecret = function(secret, cb) {
  // step 1, retrieve email from secret
  // step 2, retrieve other stuff from staged table.
  // XXX being extremely careful to preserve specific err messages in this case
  client.execute(
    "SELECT email FROM staged_secret_to_email WHERE secret = ?", [ secret ],
    function(err, resp) {
      if (err) return cb("database unavailable"); // TODO why does mysql.js say "database unavailable" in errback here?
      var email = getValue(resp, 'email');
      if (!email) return cb("no such secret"); // seems misleading but is correct if you look at the two err msgs in mysql.js
      client.execute(
        "SELECT existing_user, passwd FROM staged WHERE email = ?", [ email ],
        function(er2, resp2) {
          if (er2) return cb("database unavailable"); // TODO ditto.

          // if the record was not found, fail out
          if (!resp2 || resp2.rows.length !== 1) return cb("no such secret"); // TODO ditto again.

          cb(null, email, getValue(resp2, 'existing_user'), getValue(resp2, 'passwd'));
        }
      );
    }
  );
}
exports.authForVerificationSecret = function(secret, cb) {
  // step 1, retrieve email from secret
  // step 2, retrieve other stuff from staged table.
  client.execute(
    "SELECT email FROM staged_secret_to_email WHERE secret = ?", [ secret ],
    function(err, resp) {
      if (err) return cb("database unavailable"); // TODO why does mysql.js say "database unavailable" in this errback too?
      var email = getValue(resp, 'email');
      if (!email) return cb("no password for user"); // seems misleading but is correct if you look at the err msgs in mysql.js
      client.execute(
        "SELECT existing_user, passwd FROM staged WHERE email = ?", [ email ],
        function(er2, resp2) {
          if (er2) return cb("database unavailable");

          // if the record was not found, fail out
          if (!resp2 || resp2.rows.length !== 1) return cb("no password for user");

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
  client.execute(
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

  var query = "BEGIN BATCH" +
    " UPDATE user SET emails = emails + [ ? ] WHERE id = ?" +
    " INSERT INTO email(user, address, type, verified) VALUES(?, ?, ?, ?)" +
    " APPLY BATCH",
    args = [ email, userID, userID, email, type, true];
  client.execute(query, args,
    function(err) {
      if (err) {
        logUnexpectedError(err);
        return cb(err);
      }
      cb(null, email, userID);
    }
  );
}

function getAndDeleteRowForSecret(secret, cb) {
  // get the secret, then delete from both tables.
  // if the secret isn't found, deal.
  client.execute(
    "SELECT email FROM staged_secret_to_email WHERE secret = ?", [ secret ],
    function(err, resp) {
      if (err) {
        logUnexpectedError(err);
        return cb(err);
      }
      var email = getValue(resp, 'email');
      if (!email) { return cb("unknown secret") } // TODO once again, reusing existing err messages in odd spots for continuity's sake. sigh
      client.execute(
        "SELECT * FROM staged WHERE email = ?", [ email ],
        function(er2, resp2) {
          if (er2) {
            logUnexpectedError(er2);
            return cb(er2);
          }
          if (!resp2) { return cb("unknown secret") }
          var deleteQuery = "BEGIN BATCH" +
            " DELETE FROM staged WHERE email = ?" +
            " DELETE FROM staged_secret_to_email WHERE secret = ?" +
            " APPLY BATCH",
            deleteArgs = [ email, secret ];
            
          client.execute(deleteQuery, deleteArgs,
            function(er) {
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
              cb(er, o);
            }
          );
        }
      );
    }
  );
}

// TODO batch may make more sense than these funny callbacks doing disjointed writes
exports.completeCreateUser = function(secret, cb) {
  getAndDeleteRowForSecret(secret, function(err, o) {
    if (err) return cb(err);

    if (!o.new_acct) return cb("this verification link is not for a new account");
    dbutils.withType(o.email, function(type) {
      // we're creating a new account, add appropriate entries into user and email tables.

      // generate the id client-side to ease addEmailToUser call
      var id = generateUserID();
      client.execute(
        "INSERT INTO user(id, passwd, lastPasswordReset, failedAuthTries) VALUES(?, ?, ?, ?)", [ id, o.passwd, now(), 0 ],
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
// TODO batch may make more sense than these funny callbacks doing disjointed writes
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

// TODO batch may make more sense than these funny callbacks doing disjointed writes
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
      client.execute(
        "SELECT emails FROM user WHERE id = ?", [ user ],
        function(err, resp) {
          if (err || !resp) { return cb(err || "no emails found belonging to user"); }

          // now, exclude the just-updated email
          var allEmails = getValue(resp, 'emails');
          var i = allEmails.indexOf(o.email);
          allEmails.splice(i, 1);

          // second query: for all those other than the one just verified, flip the verification bit
          client.execute(
            "UPDATE email SET verified = ? WHERE address IN ?", [ false, allEmails ],
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
  var lastPasswordReset = now(),
    uid = generateUserID(),
    query = "BEGIN BATCH" +
      " INSERT INTO user(id, lastPasswordReset, failedAuthTries, emails) VALUES(?, ?, ?)" +
      " INSERT INTO email(user, address, type, verified) VALUES(?, ?, ?)" +
      " APPLY BATCH",
    args = [ uid, lastPasswordReset, 0, [email], uid, email, 'primary', true ];
  client.execute(query, args, 
    function(err) {
      cb(err, uid, lastPasswordReset);
    }
  );
}

exports.emailsBelongToSameAccount = function(lhs, rhs, cb) {
  // let's just do two queries and compare results
  // TODO what if two local nodes are inconsistent? need LOCAL_QUORUM, methinks
  var lhsUser, rhsUser;
  client.execute(
    "SELECT user FROM email WHERE address = ?", [ lhs ],
    function(err, resp) {
      if (err) return cb(err);
      lhsUser = getValue(resp, 'user');
      client.execute(
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
  client.execute(
    "SELECT emails FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      if (err) return cb(err);
      if (!resp.rows.length) return cb(null, false);
      var emails = getValue(resp, 'emails');
      cb(err || !emails, emails && emails.length && emails.indexOf(email) !== -1);
    }
  );
}

// NOTE: if adding an email to an existing account, we don't get the hash passed in. odd.
exports.stageEmail = function(existing_user, new_email, hash, cb) {
  var hash = hash || null;
  secrets.generate(48, function(secret) {
    // overwrite_password is used in mysql.js but refers to "old flow" which is
    // probably not relevant by now? TODO investigate
    var query = "BEGIN BATCH" +
      " INSERT INTO staged (secret, new_acct, existing_user, email, passwd, ts) VALUES (?, ?, ?, ?, ?, ?)" +
      " INSERT INTO staged_secret_to_email (secret, email) VALUES (?, ?)" +
      " APPLY BATCH",
      args = [ secret, false, existing_user, new_email, hash, now(), secret, new_email ];

    client.execute(query, args, 
      function(err) {
        cb(err, err ? undefined : secret);
      }
    );
  });
}

exports.emailToUID = function(email, cb) {
  client.execute(
    "SELECT user FROM email WHERE address = ?", [ email ],
    function(err, resp) {
      cb(err, getValue(resp, 'user'));
    }
  );
}

exports.checkAuth = function(uid, cb) {
  client.execute(
    "SELECT passwd, failedAuthTries FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      var failedAuthTries = Number(getValue(resp, 'failedauthtries'));
      if (isNaN(failedAuthTries) || typeof failedAuthTries != 'number') { failedAuthTries = 0; }
      cb(err, getValue(resp, 'passwd'), failedAuthTries);
    }
  );
}

exports.lastPasswordReset = function(uid, cb) {
  // TODO doublecheck this returns unix timestamp (seconds) not milliseconds
  //      it's possible this doesn't matter, need to investigate
  client.execute(
    "SELECT unixTimestampOf(lastPasswordReset) FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      var lastSeen = Number(getValue(resp, 'unixTimestampOf(lastpasswordreset)')); // NB: keys are lowercased by cassandra
      cb(err, lastSeen);
    }
  );
}

exports.updatePassword = function(uid, hash, invalidateSessions, cb) {
  // upon password update we'll always update the hash and reset 'failedAuthTries'
  var query = "UPDATE user SET passwd = ?, failedAuthTries = ?",
    args = [ hash, 0 ];
  // if invalidateSessions is specified, we'll update the lastPasswordReset field
  // which will end all outstanding sessions for this user
  if (invalidateSessions) {
    query += ", lastPasswordReset = ?";
    args.push(now());
  }
  // finally, we always have the where clause.
  query += " WHERE id = ?";
  args.push(uid);

  client.execute(
    query, args,
    function(err, resp) {
      // TODO how to verify that the record existed? see mysql.js#updatePassword.
      // cassandra 2.0 gives us UPDATE IF, till then it's read-then-write :-\
      cb(err);
    }
  );
}

exports.clearAuthFailures = function(uid, cb) {
  client.execute(
    "UPDATE user SET failedAuthTries = ? WHERE id = ?", [ 0, uid ],
    function(err) {
      // TODO how to verify that the user existed?
      cb(err);
    }
  );
}

exports.incAuthFailures = function(uid, cb) {
  // TODO read-then-write spells your doom, young skywalker. use LOCAL_QUORUM at least.
  // It is unfortunate that counters can't be reset to zero, or we could just use those.
  client.execute(
    "SELECT failedAuthTries FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      if (err) return cb(err);
      var failedAuthTries = Number(getValue(resp, 'failedauthtries'));
      var incremented = isNaN(failedAuthTries) ? 1 : failedAuthTries + 1;
      client.execute(
        "UPDATE user SET failedAuthTries = ? WHERE id = ?", [ incremented, uid ],
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
  client.execute(
    "SELECT emails FROM user WHERE id = ?", [ uid ],
    function(err, resp) {
      if (err) return cb(err);
      return cb(err, getValue(resp, 'emails'));
    }
  );
}

exports.emailLastUsedAs = function(email, cb) {
  client.execute(
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
    client.execute(
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

    var query = "BEGIN BATCH" +
      " DELETE FROM email WHERE address = ?" +
      " UPDATE user SET emails = emails - ? WHERE id = ?" +
      " APPLY BATCH",
      args = [ email, [email], authenticated_user ];

    client.execute(query, args, cb);
  });
}

exports.cancelAccount = function(uid, cb) {
  // delete all emails belonging to user
  // delete all staged emails belonging to user
  // delete user

  // TODO obviously, clean up this duplication

  // 1. list all emails belonging to user. (so we can delete them)
  exports.listEmails(uid, function(err, emailsToDelete) {
    // get staged emails
    client.execute(
      "SELECT emails FROM staged_existingUser_to_email WHERE existing_user = ? ",
      [ uid ],
      function(err, resp) {
        var stagedEmails = getValue(resp, 'emails');

        if (stagedEmails) {
          // get all secrets corresponding to staged emails
          client.execute(
            "SELECT secret FROM staged WHERE email IN ( ? )", [ stagedEmails ],
            function(err, stagedSecrets) {
              var secrets = [];
              stagedSecrets.rows.forEach(function(row) {
                secrets.push(getRowValue(row, 'secret'));
              });
              // delete emails
              // delete all staged emails belonging to user
              // delete all secret->email entries 
              // delete existing_user->staged entries
              // finally, delete user
              var deleteQuery = "BEGIN BATCH" +
                " DELETE FROM email WHERE address IN ( ? )" +
                " DELETE FROM staged WHERE email IN ( ? )" +
                " DELETE FROM staged_secret_to_email WHERE secret IN ( ? )" + 
                " DELETE FROM staged_existingUser_to_email WHERE existing_user = ? " +
                " DELETE FROM user WHERE id = ?" +
                " APPLY BATCH",
                deleteArgs = [ emailsToDelete.join(', '), stagedEmails, secrets, uid, uid ];

              client.execute(deleteQuery, deleteArgs, cb);
            }
          );
        } else {
          // similar but not deleting any staged stuff
          // delete emails
          // delete all secret->email entries 
          // finally, delete user
          var deleteQuery = "BEGIN BATCH" +
            " DELETE FROM email WHERE address IN ( ? )" +
            " DELETE FROM user WHERE id = ?" +
            " APPLY BATCH",
            deleteArgs = [ emailsToDelete.join(', '), uid ];

          client.execute(deleteQuery, deleteArgs, cb);
        }
      }
    );
  });
}

// TODO should we stage email inside the batch call? I think so.
exports.createUnverifiedUser = function(email, hash, cb) {
  var uid = generateUserID(),
    query = "BEGIN BATCH" +
    " INSERT INTO user(id, passwd, lastPasswordReset, failedAuthTries, email) VALUES(?, ?, ?, ?)" +
    " INSERT INTO email(user, address, verified) VALUES(?, ?, ?)" +
    " APPLY BATCH",
    args = [ uid, hash, now(), 0, email, uid, email, false ];
      
  client.execute(query, args,
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

exports.addTestUser = function(email, hash, cb) {
  var uid = generateUserID(),
    query = "BEGIN BATCH" +
    " INSERT INTO user(id, passwd, lastPasswordReset, failedAuthTries, email) VALUES(?, ?, ?, ?)" +
    " INSERT INTO email(user, address, verified) VALUES(?, ?, ?)" +
    " APPLY BATCH",
    args = [ uid, hash, now(), 0, email, uid, email, true ];
  client.execute(query, args,
    function(err) {
      if (err) logUnexpectedError(err);
      cb(err, err ? null : email);
    }
  );
}
// TODO we shouldn't be relying on a node process to manage DB health checks.
//      let's remove the code which relies on this, and monitor the DB properly.
//      for the moment, it's a no-op which reminds us not to deploy it by erroring.
exports.ping = function(cb) { cb('ping function not implemented') };

// remap exports.foo to exports._foo, log arguments
// passed to foo, then call _foo.
for (fun in exports) {
  (function(f) {
    // bail if it's not a function I added to the exports object
    if (typeof exports[f] !== 'function' || !exports.hasOwnProperty(f)) { return; }
    exports['_' + f] = exports[f];
    exports[f] = function() {
      console.error("lib::db:cassandra." + f + " intercepted. Args: " + JSON.stringify(arguments, null, ' '));
      exports['_' + f].apply(exports, arguments);
    }
  })(fun)
}
