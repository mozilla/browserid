/*jshint browsers:true, forin: true, laxbreak: true */
/*global steal: true, test: true, start: true, stop: true, module: true, ok: true, equal: true, BrowserIDStorage:true, BrowserIDNetwork: true , BrowserIDIdentities: true */
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
/**
 * This test assumes for authentication that there is a user named 
 * "testuser@testuser.com" with the password "testuser"
 */
var jwk = require("./jwk");
var jwcert = require("./jwcert");

steal.plugins("jquery", "funcunit/qunit").then("/dialog/resources/browserid-identities", function() {
  // I generated these locally, they are used nowhere else.
  var pubkey = {"algorithm":"RS","n":"56063028070432982322087418176876748072035482898334811368408525596198252519267108132604198004792849077868951906170812540713982954653810539949384712773390200791949565903439521424909576832418890819204354729217207360105906039023299561374098942789996780102073071760852841068989860403431737480182725853899733706069","e":"65537"};

  var privkey = {"algorithm":"RS","n":"56063028070432982322087418176876748072035482898334811368408525596198252519267108132604198004792849077868951906170812540713982954653810539949384712773390200791949565903439521424909576832418890819204354729217207360105906039023299561374098942789996780102073071760852841068989860403431737480182725853899733706069","e":"65537","d":"786150156350274055174913976906933968265264030754683486390396799104417261473770120296370873955240982995278496143719986037141619777024457729427415826765728988003471373990098269492312035966334999128083733012526716409629032119935282516842904344253703738413658199885458117908331858717294515041118355034573371553"};

  // this cert is meaningless, but it has the right format
  var random_cert = "eyJhbGciOiJSUzEyOCJ9.eyJpc3MiOiJpc3N1ZXIuY29tIiwiZXhwIjoxMzE2Njk1MzY3NzA3LCJwdWJsaWMta2V5Ijp7ImFsZ29yaXRobSI6IlJTIiwibiI6IjU2MDYzMDI4MDcwNDMyOTgyMzIyMDg3NDE4MTc2ODc2NzQ4MDcyMDM1NDgyODk4MzM0ODExMzY4NDA4NTI1NTk2MTk4MjUyNTE5MjY3MTA4MTMyNjA0MTk4MDA0NzkyODQ5MDc3ODY4OTUxOTA2MTcwODEyNTQwNzEzOTgyOTU0NjUzODEwNTM5OTQ5Mzg0NzEyNzczMzkwMjAwNzkxOTQ5NTY1OTAzNDM5NTIxNDI0OTA5NTc2ODMyNDE4ODkwODE5MjA0MzU0NzI5MjE3MjA3MzYwMTA1OTA2MDM5MDIzMjk5NTYxMzc0MDk4OTQyNzg5OTk2NzgwMTAyMDczMDcxNzYwODUyODQxMDY4OTg5ODYwNDAzNDMxNzM3NDgwMTgyNzI1ODUzODk5NzMzNzA2MDY5IiwiZSI6IjY1NTM3In0sInByaW5jaXBhbCI6eyJlbWFpbCI6InRlc3R1c2VyQHRlc3R1c2VyLmNvbSJ9fQ.aVIO470S_DkcaddQgFUXciGwq2F_MTdYOJtVnEYShni7I6mqBwK3fkdWShPEgLFWUSlVUtcy61FkDnq2G-6ikSx1fUZY7iBeSCOKYlh6Kj9v43JX-uhctRSB2pI17g09EUtvmb845EHUJuoowdBLmLa4DSTdZE-h4xUQ9MsY7Ik";

  var credentialsValid, unknownEmails, keyRefresh, syncValid, userEmails;
  var netStub = {
    reset: function() {
      credentialsValid = syncValid = true;
      unknownEmails = [];
      keyRefresh = [];
      userEmails = {"testuser@testuser.com": {}};
    },

    stageUser: function(email, password, onSuccess) {
      onSuccess();
    },

    authenticate: function(email, password, onSuccess, onFailure) {
      onSuccess(credentialsValid);
    },

    checkAuth: function(onSuccess, onFailure) {
      onSuccess(credentialsValid);
    },

    addEmail: function(email, onSuccess, onFailure) {
      onSuccess();
    },

    removeEmail: function(email, onSuccess, onFailure) {
      onSuccess();
    },

    listEmails: function(onSuccess, onFailure) {
      onSuccess(userEmails);
    },

    certKey: function(email, pubkey, onSuccess, onFailure) {
      if (syncValid) {
        onSuccess(random_cert);
      }
      else {
        onFailure();
      }
    },
    
    syncEmails: function(issued_identities, onSuccess, onFailure) {
      onSuccess({
        unknown_emails: unknownEmails,
        key_refresh: keyRefresh
      });
    },

    setKey: function(email, keypair, onSuccess, onFailure) {
      if (syncValid) {
        onSuccess();
      }
      else {
        onFailure();
      }
    },

    cancelUser: function(onSuccess) {
      onSuccess();
    },

    serverTime: function(onSuccess) {
      onSuccess(new Date());
    },

    logout: function(onSuccess) {
      credentialsValid = false;
      onSuccess();
    }
  };

  module("browserid-identities-unit", {

    setup: function() {
      BrowserIDIdentities.setNetwork(netStub);
      netStub.reset();
    },
    teardown: function() {
      BrowserIDIdentities.setNetwork(BrowserIDNetwork);
    }
  });

  function failure(message) {
    return function() {
      ok(false, message);
      start();
    };
  }

  test("getStoredIdentities", function() {
    var identities = BrowserIDIdentities.getStoredIdentities();
    equal("object", typeof identities, "we have some identities");
  });

  test("clearStoredIdentities", function() {
    BrowserIDIdentities.clearStoredIdentities();
    var identities = BrowserIDIdentities.getStoredIdentities();
    var count = 0;
    for(var key in identities) { 
      if(identities.hasOwnProperty(key)) {
        count++; 
      }
    }

    equal(0, count, "after clearing, there are no identities");
  });

  test("stageIdentity", function() {
    BrowserIDIdentities.stageIdentity("testuser@testuser.com", "testuser", function(keypair) {
      equal("object", typeof keypair, "We have a key pair");
      start();
    }, failure("stageIdentity failure"));

    stop();
  });


  test("confirmIdentity on staged identity", function() {
    BrowserIDIdentities.stageIdentity("testuser@testuser.com", "testuser", function(keypair) {
      BrowserIDIdentities.confirmIdentity("testuser@testuser.com", function() {
        ok(true, "confirming staged identity");
        start();
      });
    }, failure("stageIdentity failure"));

    stop();
  });


  test("confirmIdentity on non staged identity", function() {
    BrowserIDIdentities.stageIdentity("testuser@testuser.com", "testuser", function(keypair) {
      BrowserIDIdentities.confirmIdentity("testuser2@testuser.com", function onSuccess() {
        ok(false, "confirming unstaged identity");
        start();
      }, function onFailure() {
        ok(true, "confirming unstaged identity should fail");
        start();
      });
    }, failure("stageIdentity failure"));

    stop();
  });


  test("confirmIdentity on previously confirmed identity", function() {
    BrowserIDIdentities.stageIdentity("testuser@testuser.com", "testuser", function(keypair) {
      BrowserIDIdentities.confirmIdentity("testuser@testuser.com", function() {
        BrowserIDIdentities.confirmIdentity("testuser@testuser.com", function() {
          ok(false, "confirming previously confirmed identity should fail");
          start();
        }, function onFailure() {
          ok(true, "confirming previously confirmed identity should fail");  
          start();
        });
      });
    }, failure("stageIdentity failure"));

    stop();
  });



  test("authenticateAndSync with valid credentials", function() {
    BrowserIDIdentities.authenticateAndSync("testuser@testuser.com", "testuser", function() {
    }, function(authenticated) {
      equal(true, authenticated, "we are authenticated!");
      start();
    }, failure("Authentication failure"));

    stop();

  });



  test("authenticateAndSync with invalid credentials", function() {
    credentialsValid = false;
    BrowserIDIdentities.authenticateAndSync("testuser@testuser.com", "testuser", function onSuccess(authenticated) {
      ok(false, "This should not be called on authentication failure");
    }, function onComplete(authenticated) {
      equal(false, authenticated, "invalid authentication.");
      start();
    }, failure("Authentication failure"));

    stop();

  });



  test("checkAuthenticationAndSync with valid authentication", function() {
    credentialsValid = true;
    BrowserIDIdentities.checkAuthenticationAndSync(function onSuccess() {},
    function onComplete(authenticated) {
      ok(authenticated, true, "We are authenticated!");
      start();
    });

    stop();
  });



  test("checkAuthenticationAndSync with invalid authentication", function() {
    credentialsValid = false;
    BrowserIDIdentities.checkAuthenticationAndSync(function onSuccess() {
        ok(false, "We are not authenticated!");
        start();
      }, function onComplete(authenticated) {
      equal(authenticated, false, "We are not authenticated!");
      start();
    });

    stop();
  });


  test("authenticateAndSync with valid authentication", function() {
    credentialsValid = true;
    keyRefresh = ["testuser@testuser.com"]; 
    BrowserIDStorage.clearEmails();

    BrowserIDIdentities.authenticateAndSync("testuser@testuser.com", "testuser", function() {
    }, function(authenticated) {
      var identities = BrowserIDIdentities.getStoredIdentities();
      ok("testuser@testuser.com" in identities, "authenticateAndSync syncs email addresses");
      ok(authenticated, "we are authenticated")
      start();
    });

    stop();
  });



  test("authenticateAndSync with invalid authentication", function() {
    credentialsValid = false;
    keyRefresh = ["testuser@testuser.com"]; 
    BrowserIDStorage.clearEmails();

    BrowserIDIdentities.authenticateAndSync("testuser@testuser.com", "testuser", function() {
    }, function(authenticated) {
      var identities = BrowserIDIdentities.getStoredIdentities();
      equal("testuser@testuser.com" in identities, false, "authenticateAndSync does not sync if authentication is invalid");
      equal(authenticated, false, "not authenticated");
      start();
    });

    stop();
  });



  test("addIdentity", function() {
    BrowserIDIdentities.addIdentity("testemail@testemail.com", function(keypair) {
      equal("object", typeof keypair, "we have a keypair");

      var identities = BrowserIDIdentities.getStoredIdentities();
      equal(false, "testemail@testemail.com" in identities, "Our new email is not added until confirmation.");

      start();
    }, failure("addIdentity failure"));

    stop();
  });



  test("syncIdentity with successful sync", function() {
    BrowserIDStorage.clearEmails();

    syncValid = true;
    BrowserIDIdentities.syncIdentity("testemail@testemail.com", function(keypair) {
      var identities = BrowserIDIdentities.getStoredIdentities();
      ok("testemail@testemail.com" in identities, "Valid email is synced");

      start();
    }, failure("syncIdentity failure"));

    stop();
  });


  test("syncIdentity with invalid sync", function() {
    BrowserIDStorage.clearEmails();

    syncValid = false;
    BrowserIDIdentities.syncIdentity("testemail@testemail.com", function(keypair) {
      ok(false, "sync was invalid, this should have failed");
      start();
    }, function() {
      var identities = BrowserIDIdentities.getStoredIdentities();
      equal("testemail@testemail.com" in identities, false, "Invalid email is not synced");

      start();      
    });

    stop();
  });



  test("persistIdentity", function() {
    var user_kp = jwk.KeyPair.generate("RS",64);
    BrowserIDIdentities.persistIdentity("testemail2@testemail.com", user_kp, undefined, function onSuccess() {
      var identities = BrowserIDIdentities.getStoredIdentities();
      ok("testemail2@testemail.com" in identities, "Our new email is added");
      start(); 
    });

    stop();
  });



  test("removeIdentity that is added", function() {
    BrowserIDStorage.addEmail("testemail@testemail.com", {pub: "pub", priv: "priv"});

    BrowserIDIdentities.removeIdentity("testemail@testemail.com", function() {
      var identities = BrowserIDIdentities.getStoredIdentities();
      equal(false, "testemail@testemail.com" in identities, "Our new email is removed");
      start();
    }, failure("removeIdentity failure"));

    stop();
  });



  test("removeIdentity that is not added", function() {
    BrowserIDStorage.clearEmails();

    BrowserIDIdentities.removeIdentity("testemail@testemail.com", function() {
      var identities = BrowserIDIdentities.getStoredIdentities();
      equal(false, "testemail@testemail.com" in identities, "Our new email is removed");
      start();
    }, failure("removeIdentity failure"));

    stop();
  });



  test("syncIdentities with no pre-loaded identities and no identities to add", function() {
    BrowserIDStorage.clearEmails();
    userEmails = {};

    BrowserIDIdentities.syncIdentities(function onSuccess() {
      var identities = BrowserIDIdentities.getStoredIdentities();
      ok(true, "we have synced identities");
      equal(_.size(identities), 0, "there are no identities");
      start();
    }, failure("identity sync failure"));

    stop();
  });

  test("syncIdentities with no pre-loaded identities and identities to add", function() {
    BrowserIDStorage.clearEmails();
    userEmails = {"testuser@testuser.com": {}};

    BrowserIDIdentities.syncIdentities(function onSuccess() {
      var identities = BrowserIDIdentities.getStoredIdentities();
      ok("testuser@testuser.com" in identities, "Our new email is added");
      equal(_.size(identities), 1, "there is one identity");
      start(); 
    }, failure("identity sync failure"));

    stop();
  });

  test("syncIdentities with identities preloaded and none to add", function() {
    BrowserIDStorage.clearEmails();
    userEmails = {"testuser@testuser.com": {}};
    BrowserIDStorage.addEmail("testuser@testuser.com", {});
    BrowserIDIdentities.syncIdentities(function onSuccess() {
      var identities = BrowserIDIdentities.getStoredIdentities();
      ok("testuser@testuser.com" in identities, "Our new email is added");
      equal(_.size(identities), 1, "there is one identity");
      start();
    }, failure("identity sync failure"));

    stop();
  });


  test("syncIdentities with identities preloaded and one to add", function() {
    BrowserIDStorage.clearEmails();
    BrowserIDStorage.addEmail("testuser@testuser.com", {pubkey: pubkey, cert: random_cert});
    userEmails = {"testuser@testuser.com": {pubkey: pubkey, cert: random_cert},
                  "testuser2@testuser.com": {pubkey: pubkey, cert: random_cert}};

    BrowserIDIdentities.syncIdentities(function onSuccess() {
      var identities = BrowserIDIdentities.getStoredIdentities();
      ok("testuser@testuser.com" in identities, "Our old email address is still there");
      ok("testuser2@testuser.com" in identities, "Our new email is added");
      equal(_.size(identities), 2, "there are two identities");
      start();
    }, failure("identity sync failure"));

    stop();
  });


  test("syncIdentities with identities preloaded and one to remove", function() {
    BrowserIDStorage.clearEmails();
    BrowserIDStorage.addEmail("testuser@testuser.com", {pub: pubkey, cert: random_cert});
    BrowserIDStorage.addEmail("testuser2@testuser.com", {pub: pubkey, cert: random_cert});
    userEmails = {"testuser@testuser.com":  { pub: pubkey, cert: random_cert}};

    BrowserIDIdentities.syncIdentities(function onSuccess() {
      var identities = BrowserIDIdentities.getStoredIdentities();
      ok("testuser@testuser.com" in identities, "Our old email address is still there");
      equal("testuser2@testuser.com" in identities, false, "Our unknown email is removed");
      equal(_.size(identities), 1, "there is one identity");
      start();
    }, failure("identity sync failure"));

    stop();
  });


  test("getIdentityAssertion with known email", function() {
    BrowserIDStorage.clearEmails();
    var keypair = jwk.KeyPair.generate("RS",64);
    BrowserIDIdentities.certifyIdentity("testuser@testuser.com", keypair, function() {
      BrowserIDIdentities.getIdentityAssertion("testuser@testuser.com", function onSuccess(assertion) {
        equal("string", typeof assertion, "we have an assertion!");
        start();
      });
    }, failure("getIdentityAssertion failure"));

    stop();
  });


  test("getIdentityAssertion with unknown email", function() {
    BrowserIDStorage.clearEmails();
    var keypair = jwk.KeyPair.generate("RS",64);
    BrowserIDIdentities.certifyIdentity("testuser@testuser.com", keypair, function() {
      BrowserIDIdentities.getIdentityAssertion("testuser2@testuser.com", function onSuccess(assertion) {
        equal("undefined", typeof assertion, "email was unknown, we do not have an assertion");
        start();
      });
    }, failure("getIdentityAssertion failure"));
    
    stop();
  });

  test("logoutUser", function(onSuccess) {
    credentialsValid = true;
    keyRefresh = ["testuser@testuser.com"]; 
    BrowserIDStorage.clearEmails();

    BrowserIDIdentities.authenticateAndSync("testuser@testuser.com", "testuser", function() {
    }, function(authenticated) {
      var storedIdentities = BrowserIDStorage.getEmails();
      equal(_.size(storedIdentities), 1, "one identity");

      BrowserIDIdentities.logoutUser(function() {
        storedIdentities = BrowserIDStorage.getEmails();
        equal(_.size(storedIdentities), 0, "All items have been removed on logout");

        equal(credentialsValid, false, "credentials were invalidated in logout");
        start();
      });
    });

    stop();
  });

  test("cancelUser", function(onSuccess) {
    BrowserIDIdentities.cancelUser(function() {
      var storedIdentities = BrowserIDStorage.getEmails();
      equal(_.size(storedIdentities), 0, "All items have been removed");
      start();
    });

    stop();
  });

});
