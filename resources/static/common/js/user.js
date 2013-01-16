/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

BrowserID.User = (function() {
  "use strict";

  var jwcrypto, origin,
      bid = BrowserID,
      network = bid.Network,
      storage = bid.Storage,
      helpers = bid.Helpers,
      User,
      pollTimeout,
      provisioning = bid.Provisioning,
      addressCache = {},
      primaryAuthCache = {},
      complete = bid.Helpers.complete,
      registrationComplete = false,
      POLL_DURATION = 3000,
      pollDuration = POLL_DURATION,
      stagedEmail,
      stagedPassword;

  function prepareDeps() {
    /*globals require:true*/
    if (!jwcrypto) {
      jwcrypto= require("./lib/jwcrypto");
    }
  }

  // remove identities that are no longer valid
  function cleanupIdentities(cb) {
    network.serverTime(function(serverTime) {
      network.domainKeyCreationTime(function(creationTime) {
        // Determine if a certificate is expired.  That will be
        // if it was issued *before* the domain key was last updated or
        // if the certificate expires in less that 5 minutes from now.
        function isExpired(cert) {
          // if it expires in less than 2 minutes, it's too old to use.
          var diff = cert.payload.exp.valueOf() - serverTime.valueOf();
          if (diff < (60 * 2 * 1000)) {
            return true;
          }

          // or if it was issued before the last time the domain key
          // was updated, it's invalid
          if (!cert.payload.iat || cert.payload.iat < creationTime) {
            return true;
          }

          return false;
        }

        var emails = storage.getEmails();
        var issued_identities = {};
        prepareDeps();
        _(emails).each(function(email_obj, email_address) {
          try {
            email_obj.pub = jwcrypto.loadPublicKeyFromObject(email_obj.pub);
          } catch (x) {
            storage.invalidateEmail(email_address);
            return;
          }

          // no cert? reset
          if (!email_obj.cert) {
            storage.invalidateEmail(email_address);
          } else {
            try {
              // parse the cert
              var cert = jwcrypto.extractComponents(emails[email_address].cert);

              // check if this certificate is still valid.
              if (isExpired(cert)) {
                storage.invalidateEmail(email_address);
              }

            } catch (e) {
              // error parsing the certificate!  Maybe it's of an old/different
              // format?  just delete it.
              helpers.log("error parsing cert for"+ email_address +":" + e);
              storage.invalidateEmail(email_address);
            }
          }
        });
        cb();
      }, function(e) {
        // we couldn't get domain key creation time!  uh oh.
        cb();
      });
    });
  }

  function setAuthenticationStatus(authenticated) {
    if (window.$) {
      // TODO get this out of here!
      // jQuery is not included in the communication_iframe
      var func = authenticated ? 'addClass' : 'removeClass';
      $('body')[func]('authenticated');
    }

    if (!authenticated) {
      storage.clear();
    }
  }

  function stageAddressVerification(email, password, stagingStrategy, onComplete, onFailure) {
    // These are saved for the addressVerificationPoll.  If there is
    // a stagedEmail or stagedPassword when the poll completes, try to
    // authenticate the user.
    stagedEmail = email;
    stagedPassword = password;

    // stagingStrategy is a curried function that will have all but the
    // onComplete and onFailure functions already set up.
    stagingStrategy(function(staged) {
      var status = { success: staged };

      if (!staged) status.reason = "throttle";
      // Used on the main site when the user verifies - once
      // verification is complete, the user is redirected back to the
      // RP and logged in.
      var site = User.getReturnTo();
      if (staged && site) storage.setReturnTo(site);
      complete(onComplete, status);
    }, onFailure);
  }

  function completeAddressVerification(completeFunc, token, password, onComplete, onFailure) {
    if (password && password.length < bid.PASSWORD_MIN_LENGTH) {
      // If the password is too short, the backend throws a 400 error saying
      // the password string is out of range. If the password is within range
      // but incorrect, it returns a 401 error. The desired behavior if the
      // user types an incorrect password is to show a tooltip and allow the
      // user to re-enter their password. If the password is too short, do not
      // make the request but instead call the onFailure callback with
      // a synthesized "incorrect password" response. The front end will take
      // care of the rest.
      return complete(onFailure, { network: { status: 401 } });
    }

    User.tokenInfo(token, function(info) {
      var invalidInfo = { valid: false };
      if (info) {
        completeFunc(token, password, function (valid) {
          var result = invalidInfo;

          if (valid) {
            result = _.extend({ valid: valid }, info);
            storage.setReturnTo("");
          }

          complete(onComplete, result);
        }, onFailure);
      } else if (onComplete) {
        onComplete(invalidInfo);
      }
    }, onFailure);

  }

  function addressVerificationPoll(checkFunc, email, onSuccess, onFailure) {
    function userVerified(completionStatus) {
      if (stagedEmail && stagedPassword) {
        // The user has set their email and password as part of the
        // staging flow. Log them in now just to make sure their
        // authentication creds are up to date. This fixes a problem where the
        // backend incorrectly sends a mustAuth status to users who have just
        // completed verification. See issue #1682
        // https://github.com/mozilla/browserid/issues/1682
        User.authenticate(stagedEmail, stagedPassword, function(authenticated) {
          completionStatus = authenticated ? "complete" : "mustAuth";
          completeVerification(completionStatus);
        }, onFailure);

        stagedEmail = stagedPassword = null;
      }
      else {
        // If the user's completionStatus is complete but their
        // authStatus is not password, that means they have not entered in
        // their authentication credentials this session and *must*
        // do so.  If not, the backend will reject any requests to certify
        // a key because the user will not have the correct creds to do so.
        // See issue #2088 https://github.com/mozilla/browserid/issues/2088
        network.checkAuth(function(authStatus) {
          if (completionStatus === "complete" && authStatus !== "password")
            completionStatus = "mustAuth";

          completeVerification(completionStatus);
        }, onFailure);
      }
    }

    function completeVerification(status) {
      // As soon as the registration comes back as complete, we should
      // ensure that the stagedOnBehalfOf is cleared so there is no stale
      // data.
      storage.setReturnTo("");

      // registrationComplete is used in shouldAskIfUsersComputer to
      // prevent the user from seeing the "is this your computer" screen if
      // they just completed a registration.
      registrationComplete = true;

      if (status === "complete") {
        User.syncEmails(function() {
          complete(onSuccess, status);
        }, onFailure);
      }
      else {
        complete(onSuccess, status);
      }
    }

    function poll() {
      checkFunc(email, function(status) {
        // registration status checks the status of the last initiated registration,
        // it's possible return values are:
        //   'complete' - registration has been completed
        //   'pending'  - a registration is in progress
        //   'mustAuth' - user must authenticate
        //   'noRegistration' - no registration is in progress
        if (status === "complete" || status === "mustAuth") {
          userVerified(status);
        }
        else if (status === 'pending') {
          pollTimeout = setTimeout(poll, pollDuration);
        }
        else {
          complete(onFailure, status);
        }
      }, onFailure);
    }

    poll();
  }

  function cancelRegistrationPoll() {
    if (pollTimeout) {
      clearTimeout(pollTimeout);
      pollTimeout = null;
    }
  }

  function getIdPName(addressInfo) {
    return helpers.getDomainFromEmail(addressInfo.email);
  }

  /**
   * Persist an address and key pair locally.
   * @method persistEmailKeypair
   * @param {string} email - Email address to persist.
   * @param {object} keypair - Key pair to save
   * @param {function} [onComplete] - Called on successful completion.
   * @param {function} [onFailure] - Called on error.
   */
  function persistEmailKeypair(email, keypair, cert, onComplete, onFailure) {
    var now = new Date();
    var email_obj = storage.getEmails()[email] || {
      created: now
    };

    _.extend(email_obj, {
      updated: now,
      pub: keypair.publicKey.toSimpleObject(),
      priv: keypair.secretKey.toSimpleObject(),
      cert: cert
    });

    storage.addEmail(email, email_obj);
    if (onComplete) onComplete(true);
  }

  /**
   * Certify an identity with the server, persist it to storage if the server
   * says the identity is good
   * @method certifyEmailKeypair
   */
  function certifyEmailKeypair(email, keypair, onComplete, onFailure) {
    network.certKey(email, keypair.publicKey, function(cert) {
      persistEmailKeypair(email, keypair, cert, onComplete, onFailure);
    }, onFailure);
  }

  /**
   * Persist an email address without a keypair
   * @method persistEmail
   * @param {object} options - options to save
   * @param {string} options.email - Email address to persist.
   * @param {string} options.type - Is the email a 'primary' or a 'secondary' address?
   * @param {string} options.verified - If the email is 'secondary', is it verified?
   */
  function persistEmail(options) {
    storage.addEmail(options.email, {
      created: new Date()
    });
  }


  User = {
    init: function(config) {
      if (config.provisioning) {
        provisioning = config.provisioning;
      }

      // BEGIN TESTING API
      if (config.pollDuration) {
        pollDuration = config.pollDuration;
      }
      // END TESTING API
    },

    reset: function() {
      provisioning = BrowserID.Provisioning;
      User.resetCaches();
      registrationComplete = false;
      pollDuration = POLL_DURATION;
      stagedEmail = stagedPassword = null;
    },

    resetCaches: function() {
      addressCache = {};
      primaryAuthCache = {};
    },

    /**
     * Set the interface to use for networking.  Used for unit testing.
     * @method setNetwork
     * @param {BrowserID.Network} networkInterface - BrowserID.Network
     * compatible interface to use.
     */
    setNetwork: function(networkInterface) {
      network = networkInterface;
    },

    /**
     * setOrigin
     * @method setOrigin
     * @param {string} origin
     */
    setOrigin: function(originArg) {
      origin = originArg;
    },

    /**
     * Get the origin of the current host being signed in to.
     * @method getOrigin
     * @return {string} origin
     */
    getOrigin: function() {
      return origin;
    },

    setOriginEmail: function(email) {
      storage.site.set(origin, "email", email);
    },

    getOriginEmail: function() {
      return storage.site.get(origin, "email");
    },

    /**
     * Get the hostname for the set origin
     * @method getHostname
     * @returns {string}
     */
    getHostname: function() {
      return origin.replace(/^.*:\/\//, "").replace(/:\d*$/, "");
    },

    setReturnTo: function(returnTo) {
      this.returnTo = returnTo;
    },

    getReturnTo: function() {
      return this.returnTo;
    },

    /**
     * Create a user account - this creates an user account that must be verified.
     * @method createSecondaryUser
     * @param {string} email
     * @param {string} password
     * @param {function} [onComplete] - Called on completion.
     * @param {function} [onFailure] - Called on error.
     */
    createSecondaryUser: function(email, password, onComplete, onFailure) {
      stageAddressVerification(email, password,
        network.createUser.bind(network, email, password, origin),
        onComplete, onFailure);
    },

    /**
     * Create a primary user.
     * @method createPrimaryUser
     * @param {object} info
     * @param {function} onComplete - function to call on complettion.  Called
     * with two parameters - status and info.
     * Status can be:
     *  primary.already_added
     *  primary.verified
     *  primary.verify
     *  primary.could_not_add
     *
     *  info is passed on primary.verify and contains the info necessary to
     *  verify the user with the IdP
     */
    createPrimaryUser: function(info, onComplete, onFailure) {
      var email = info.email;
      User.provisionPrimaryUser(email, info, function(status, provInfo) {
        if (status === "primary.verified") {
          User.authenticateWithAssertion(email, provInfo.assertion, function(status) {
            if (status) {
              onComplete("primary.verified");
            }
            else {
              onComplete("primary.could_not_add");
            }
          }, onFailure);
        }
        else {
          onComplete(status, provInfo);
        }
      }, onFailure);
    },

    /**
     * A full provision a primary user, if they are authenticated, save their
     * cert/keypair.  Note, we do not authenticate to login.persona.org but
     * merely get an assertion for login.persona.org so that we can either add the
     * email to the current account or authenticate the user if not
     * authenticated.
     * @method provisionPrimaryUser
     * @param {string} email
     * @param {object} info - provisioning info
     * @param {function} [onComplete] - called when complete.  Called with
     * status field and info. Status can be:
     *  primary.already_added
     *  primary.verified
     *  primary.verify
     *  primary.could_not_add
     * @param {function} [onFailure] - called on failure
     */
    provisionPrimaryUser: function(email, info, onComplete, onFailure) {

      User.primaryUserAuthenticationInfo(email, info, function(authInfo) {
        if (authInfo.authenticated) {
          persistEmailKeypair(email, authInfo.keypair, authInfo.cert,
            function() {
              // We are getting an assertion for persona.org.
              User.getAssertion(email, "https://login.persona.org", function(assertion) {
                if (assertion) {
                  onComplete("primary.verified", {
                    assertion: assertion
                  });
                }
                else {
                  onComplete("primary.could_not_add");
                }
              }, onFailure);
            }
          );
        }
        else {
          onComplete("primary.verify", info);
        }
      }, onFailure);
    },

    /**
     * Get the IdP authentication info for a user.
     * @method primaryUserAuthenticationInfo
     * @param {string} email
     * @param {object} info - provisioning info
     * @param {function} [onComplete] - called when complete.  Called with
     * provisioning info as well as keypair, cert, and authenticated.
     *   authenticated - boolean, true if user is authenticated with primary.
     *    false otw.
     *   keypair - returned if user is authenticated.
     *   cert - returned if user is authenticated.
     * @param {function} [onFailure] - called on failure
     */
    primaryUserAuthenticationInfo: function(email, info, onComplete, onFailure) {
      var idInfo = storage.getEmail(email),
          self=this;

      primaryAuthCache = primaryAuthCache || {};

      function complete(info) {
        primaryAuthCache[email] = info;
        onComplete && _.defer(onComplete.curry(info));
      }

      if (primaryAuthCache[email]) {
        // If we have the info in our cache, we most definitely do not have to
        // ask for it.
        complete(primaryAuthCache[email]);
        return;
      }
      else if (idInfo && idInfo.cert) {
        // If we already have the info in storage, we know the user has a valid
        // cert with their IdP, we say they are authenticated and pass back the
        // appropriate info.
        var userInfo = _.extend({authenticated: true}, idInfo, info);
        complete(userInfo);
        return;
      }

      provisioning(
        {
          email: email,
          url: info.prov,
          ephemeral: !storage.usersComputer.confirmed(email)
        },
        function(keypair, cert) {
          var userInfo = _.extend({
            keypair: keypair,
            cert: cert,
            authenticated: true
          }, info);

          complete(userInfo);
        },
        function(error) {
          if (error.code === "primaryError" && error.msg === "user is not authenticated as target user") {
            var userInfo = _.extend({
              authenticated: false
            }, info);
            complete(userInfo);
          }
          else {
            onFailure(info);
          }
        }
      );
    },

    /**
     * Get the IdP authentication status for a user.
     * @method isUserAuthenticatedToPrimary
     * @param {string} email
     * @param {object} info - provisioning info
     * @param {function} [onComplete] - called when complete.  Called with
     *   status field - true if user authenticated with IdP, false otw.
     * @param {function} [onFailure] - called on failure
     */
    isUserAuthenticatedToPrimary: function(email, info, onComplete, onFailure) {
      User.primaryUserAuthenticationInfo(email, info, function(authInfo) {
        onComplete(authInfo.authenticated);
      }, onFailure);
    },

    /**
     * Poll the server until user registration is complete.
     * @method waitForUserValidation
     * @param {string} email - email address to check.
     * @param {function} [onSuccess] - Called to give status updates.
     * @param {function} [onFailure] - Called on error.
     */
    waitForUserValidation: addressVerificationPoll.curry(network.checkUserRegistration),

    /**
     * Cancel the waitForUserValidation poll
     * @method cancelUserValidation
     */
    cancelUserValidation: function() {
      cancelRegistrationPoll();
    },

    /**
     * Get site and email info for a token
     * @method tokenInfo
     * @param {string} token
     * @param {function} [onComplete]
     * @param {function} [onFailure]
     */
    tokenInfo: function(token, onComplete, onFailure) {
      network.emailForVerificationToken(token, function (info) {
        if (info) {
          info = _.extend(info, { returnTo: storage.getReturnTo() });
        }

        complete(onComplete, info);
      }, onFailure);

    },

    /**
     * Verify a user
     * @method verifyUser
     * @param {string} token - token to verify.
     * @param {string} password
     * @param {function} [onComplete] - Called on completion.
     *   Called with an object with valid, email, and origin if valid, called
     *   with valid=false otw.
     * @param {function} [onFailure] - Called on error.
     */
    verifyUser: completeAddressVerification.curry(network.completeUserRegistration),

    /**
     * Check if the user can set their password.  Only returns true for users
     * with secondary accounts
     * @method canSetPassword
     * @param {function} [onComplete] - Called on with boolean flag on
     * successful completion.
     * @param {function} [onFailure] - Called on error.
     */
    canSetPassword: function(onComplete, onFailure) {
      network.withContext(function(ctx) {
        complete(onComplete, ctx.has_password);
      }, onFailure);
    },

    /**
     * update the password of the current user.
     * @method changePassword
     * @param {string} oldpassword - the old password.
     * @param {string} newpassword - the new password.
     * @param {function} [onComplete] - called on completion.  Called with one
     * parameter, status - set to true if password update is successful, false
     * otw.
     * @param {function} [onFailure] - called on XHR failure.
     */
    changePassword: function(oldpassword, newpassword, onComplete, onFailure) {
      network.changePassword(oldpassword, newpassword, onComplete, onFailure);
    },

    /**
     * Request a password reset for the given email address.
     * @method requestPasswordReset
     * @param {string} email
     * @param {string} password
     * @param {function} [onComplete] - Callback to call when complete, called
     * with a single object, info.
     *    info.status {boolean} - true or false whether request was successful.
     *    info.reason {string} - if status false, reason of failure.
     * @param {function} [onFailure] - Called on XHR failure.
     */
    requestPasswordReset: function(email, password, onComplete, onFailure) {
      User.addressInfo(email, function(info) {
        // user is not known.  Can't request a password reset.
        if (info.state === "unknown") {
          complete(onComplete, { success: false, reason: "invalid_user" });
        }
        // user is trying to reset the password of a primary address.
        else if (info.type === "primary") {
          complete(onComplete, { success: false, reason: "primary_address" });
        }
        else {
          stageAddressVerification(email, password,
            network.requestPasswordReset.bind(network, email, password, origin),
            onComplete, onFailure);
        }
      }, onFailure);
    },

    /**
     * Verify the password reset for a user.
     * @method completePasswordReset
     * @param {string} token - token to verify.
     * @param {string} password
     * @param {function} [onComplete] - Called on completion.
     *   Called with an object with valid, email, and origin if valid, called
     *   with valid=false otw.
     * @param {function} [onFailure] - Called on error.
     */
    completePasswordReset: completeAddressVerification.curry(network.completePasswordReset),

    /**
     * Wait for the password reset to complete
     * @method waitForPasswordResetComplete
     * @param {string} email - email address to check.
     * @param {function} [onSuccess] - Called to give status updates.
     * @param {function} [onFailure] - Called on error.
     */
    waitForPasswordResetComplete: addressVerificationPoll.curry(network.checkPasswordReset),

    /**
     * Cancel the waitForPasswordResetComplete poll
     * @method cancelWaitForPasswordResetComplete
     */
    cancelWaitForPasswordResetComplete: cancelRegistrationPoll,

    /**
     * Request the reverification of an unverified email address
     * @method requestEmailReverify
     * @param {string} email
     * @param {function} [onComplete]
     * @param {function} [onFailure]
     */
    requestEmailReverify: function(email, onComplete, onFailure) {
      if (!storage.getEmail(email)) {
        // user does not own this address.
        complete(onComplete, { success: false, reason: "invalid_email" });
      }
      else {
        // try to reverify this address.
        stageAddressVerification(email, null,
          network.requestEmailReverify.bind(network, email, origin),
          onComplete, onFailure);
      }
    },

    // the verification page for reverifying an email and adding an email to an
    // account are the same, both are handled by the /confirm page. the
    // /confirm page uses the verifyEmail function.  completeEmailReverify is
    // not needed.

    /**
     * Wait for the email reverification to complete
     * @method waitForEmailReverifyComplete
     * @param {string} email - email address to check.
     * @param {function} [onSuccess] - Called to give status updates.
     * @param {function} [onFailure] - Called on error.
     */
    waitForEmailReverifyComplete: addressVerificationPoll.curry(network.checkEmailReverify),

    /**
     * Cancel the waitForEmailReverifyComplete poll
     * @method cancelWaitForEmailReverifyComplete
     */
    cancelWaitForEmailReverifyComplete: cancelRegistrationPoll,

    /**
     * Cancel the current user's account.  Remove last traces of their
     * identity.
     * @method cancelUser
     * @param {function} [onComplete] - Called whenever complete.
     * @param {function} [onFailure] - called on error.
     */
    cancelUser: function(onComplete, onFailure) {
      network.cancelUser(function() {
        setAuthenticationStatus(false);
        if (onComplete) {
          onComplete();
        }
      }, onFailure);

    },

    /**
     * Log the current user out.
     * @method logoutUser
     * @param {function} [onComplete] - Called whenever complete.
     * @param {function} [onFailure] - called on error.
     */
    logoutUser: function(onComplete, onFailure) {
      User.checkAuthentication(function(authenticated) {
        if (authenticated) {
          // logout of all websites
          storage.logoutEverywhere();

          // log out of browserid
          network.logout(function() {
            setAuthenticationStatus(false);
            complete(onComplete, !!authenticated);
          }, onFailure);
        }
        else {
          complete(onComplete, authenticated);
        }
      }, onFailure);
    },

    /**
     * Sync local identities with login.persona.org.  Generally should not need to
     * be called.
     * @method syncEmails
     * @param {function} [onComplete] - Called whenever complete.
     * @param {function} [onFailure] - Called on error.
     */
    syncEmails: function(onComplete, onFailure) {
      cleanupIdentities(function () {
        var issued_identities = User.getStoredEmailKeypairs();

        network.listEmails(function(server_emails) {
          // lists of emails
          var client_emails = _.keys(issued_identities);

          var emails_to_add = _.difference(server_emails, client_emails);
          var emails_to_remove = _.difference(client_emails, server_emails);
          var emails_to_update = _.intersection(client_emails, server_emails);

          // remove emails
          _.each(emails_to_remove, function(email) {
            storage.removeEmail(email);
          });

          // these are new emails
          _.each(emails_to_add, function(email) {
            persistEmail({ email: email });
          });

          complete(onComplete);
        }, onFailure);
      });
    },

    /**
     * Check whether the current user is authenticated.  Calls the callback
     * with false if cookies are disabled.
     * @method checkAuthentication
     * @param {function} [onComplete] - Called when check is complete with one
     * boolean parameter, authenticated.  authenticated will be true if user is
     * authenticated, false otw.
     * @param {function} [onFailure] - Called on error.
     */
    checkAuthentication: function(onComplete, onFailure) {
      network.cookiesEnabled(function(cookiesEnabled) {
        if (cookiesEnabled) {
          network.checkAuth(function(authenticated) {
            setAuthenticationStatus(authenticated);
            if (!authenticated) authenticated = false;
            complete(onComplete, authenticated);
          }, onFailure);
        }
        else {
          complete(onComplete, cookiesEnabled);
        }
      }, onFailure);
    },

    /**
     * Check whether the current user is authenticated.  If authenticated, sync
     * identities.
     * @method checkAuthenticationAndSync
     * @param {function} [onComplete] - Called on sync completion with one
     * boolean parameter, authenticated.  authenticated will be true if user
     * is authenticated, false otw.
     * @param {function} [onFailure] - Called on error.
     */
    checkAuthenticationAndSync: function(onComplete, onFailure) {
      User.checkAuthentication(function(authenticated) {
        if (authenticated) {
          User.syncEmails(function() {
            onComplete && onComplete(authenticated);
          }, onFailure);
        }
        else {
          onComplete && onComplete(authenticated);
        }
      }, onFailure);
    },

    /**
     * Authenticate the user with the given email and password.  This will sync
     * the user's addresses.
     * @method authenticate
     * @param {string} email - Email address to authenticate.
     * @param {string} password - Password.
     * @param {function} [onComplete] - Called on completion with status. true
     * if user is authenticated, false otw.
     * @param {function} [onFailure] - Called on error.
     */
    authenticate: function(email, password, onComplete, onFailure) {
      // password is out of length range.  Don't even send the request
      // and waste backend cycles. See issue #2032.
      if (password.length < bid.PASSWORD_MIN_LENGTH
       || password.length > bid.PASSWORD_MAX_LENGTH) {
        complete(onComplete, false);
        return;
      }

      network.authenticate(email, password, function(authenticated) {
        setAuthenticationStatus(authenticated);

        if (authenticated) {
          User.syncEmails(function() {
            onComplete && onComplete(authenticated);
          }, onFailure);
        } else if (onComplete) {
          onComplete(authenticated);
        }
      }, onFailure);
    },

    /**
     * Authenticate the user with the given email and assertion.  This will sync
     * the user's addresses.
     * @method authenticateWithAssertion
     * @param {string} email
     * @param {string} assertion
     * @param {function} [onComplete] - Called on completion with status. true
     * if user is authenticated, false otw.
     * @param {function} [onFailure] - Called on error.
     */
    authenticateWithAssertion: function(email, assertion, onComplete, onFailure) {
      network.authenticateWithAssertion(email, assertion, function(authenticated) {
        setAuthenticationStatus(authenticated);

        if (authenticated) {
          User.syncEmails(function() {
            complete(onComplete, authenticated);
          }, onFailure);
        } else {
          complete(onComplete, authenticated);
        }
      }, onFailure);

    },

    /**
     * Check whether the email is already registered.
     * @method isEmailRegistered
     * @param {string} email - Email address to check.
     * @param {function} [onComplete] - Called with one boolean parameter when
     * complete.  Parameter is true if `email` is already registered, false
     * otw.
     * @param {function} [onFailure] - Called on XHR failure.
     */
    isEmailRegistered: function(email, onComplete, onFailure) {
      network.emailRegistered(email, onComplete, onFailure);
    },

    /**
     * Get information about an email address.  Who vouches for it?
     * (is it a primary or a secondary)
     * @method addressInfo
     * @param {string} email - Email address to check.
     * @param {function} [onComplete] - Called with an object on success,
     *   containing these properties:
     *     type: <secondary|primary>
     *     known: boolean, present if type is secondary.  True if email
     *        address is registered with BrowserID.
     *     authed: boolean, present if type is primary - whether the user
     *        is authenticated to the IdP as this user.
     *     auth: string - url to send users for auth - present if type is
     *        primary.
     *     prov: string - url to embed for silent provisioning - present
     *        if type is secondary.
     * @param {function} [onFailure] - Called on XHR failure.
     */
    addressInfo: function(email, onComplete, onFailure) {
      function complete(info) {
        info.email = email;

        addressCache[email] = info;
        onComplete && onComplete(info);
      }

      if (addressCache[email]) {
        complete(addressCache[email]);
      }
      else {
        network.addressInfo(email, function(info) {
          info.email = email;
          info = User.checkEmailIssuer(email, info);
          if (info.type === "primary") {
            User.isUserAuthenticatedToPrimary(email, info, function(authed) {
              info.authed = authed;
              info.idpName = getIdPName(info);
              complete(info);
            }, onFailure);
          }
          else {
            complete(info);
          }
        }, onFailure);
      }
    },
    /**
     * Checks for outdated certificates and clears them from storage.
     * Returns original info, may have been altered
     * @param {string} email - Email address to check.
     * @param {object} info - Output from addressInfo callback
     * @return {object} or null
     */
    checkEmailIssuer: function(email, info) {
      function clearCert(email, idInfo) {
        delete idInfo.cert;
        delete primaryAuthCache[email];
        storage.addEmail(email, idInfo);
      }
      prepareDeps();
      var identity = User.getStoredEmailKeypair(email);
      if (identity && identity.cert && info && info.issuer) {

        // issuer MUST have changed... clear certs
        if ("transition_to_primary" === info.state && identity.cert) {
          clearCert(email, identity);
	} else {

          var prevIssuer;
          try {
            prevIssuer = jwcrypto.extractComponents(identity.cert).payload.iss;
          } catch (e) {
            // error parsing the certificate!  Maybe it's of an old/different
            // format?  just delete it.
            helpers.log("Looking for issuer, error parsing cert for"+ email +":" + e);
            clearCert(email, identity);
          }
          if (prevIssuer && info.issuer !== prevIssuer) {
            clearCert(email, identity);
          }
	}
      }
      return info;
    },
    /**
     * Add an email address to an already created account.  Sends address and
     * keypair to the server, user then needs to verify account ownership. This
     * does not add the new email address/keypair to the local list of
     * valid identities.
     * @method addEmail
     * @param {string} email
     * @param {string} password
     * @param {function} [onComplete] - Called on successful completion.
     * @param {function} [onFailure] - Called on error.
     */
    addEmail: function(email, password, onComplete, onFailure) {
      stageAddressVerification(email, password,
        network.addSecondaryEmail.bind(network, email, password, origin),
        function(status) {
          complete(onComplete, status.success);
        }, onFailure);
    },

    /**
     * Check whether a password is needed to add a secondary email address to
     * an already existing account.
     * @method passwordNeededToAddSecondaryEmail
     * @param {function} [onComplete] - Called on successful completion, called
     * with true if password is needed, false otw.
     * @param {function} [onFailure] - Called on error.
     */
    passwordNeededToAddSecondaryEmail: function(onComplete, onFailure) {
      network.withContext(function(ctx) {
        complete(onComplete, !ctx.has_password);
      }, onFailure);
    },

    /**
     * Wait for the email registration to complete
     * @method waitForEmailValidation
     * @param {string} email - email address to check.
     * @param {function} [onSuccess] - Called to give status updates.
     * @param {function} [onFailure] - Called on error.
     */
    waitForEmailValidation: addressVerificationPoll.curry(network.checkEmailRegistration),

    /**
     * Cancel the waitForEmailValidation poll
     * @method cancelEmailValidation
     */
    cancelEmailValidation: function() {
      cancelRegistrationPoll();
    },

    /**
     * Verify a users email address given by the token
     * @method verifyEmail
     * @param {string} token
     * @param {string} password
     * @param {function} [onComplete] - Called on completion.
     *   Called with an object with valid, email, and origin if valid, called
     *   with valid=false otw.
     * @param {function} [onFailure] - Called on error.
     */
    verifyEmail: completeAddressVerification.curry(network.completeEmailRegistration),

    /**
     * Remove an email address.
     * @method removeEmail
     * @param {string} email - Email address to remove.
     * @param {function} [onComplete] - Called when complete.
     * @param {function} [onFailure] - Called on error.
     */
    removeEmail: function(email, onComplete, onFailure) {
      if (storage.getEmail(email)) {
        network.removeEmail(email, function() {
          storage.removeEmail(email);
          if (onComplete) {
            onComplete();
          }
        }, onFailure);
      } else if (onComplete) {
        onComplete();
      }
    },

    /**
     * Sync an identity with the server.  Creates and stores locally and on the
     * server a keypair for the given email address.
     * @method syncEmailKeypair
     * @param {string} email - Email address.
     * @param {string} [issuer] - Issuer of keypair.
     * @param {function} [onComplete] - Called on completion.  Called with
     * status parameter - true if successful, false otw.
     * @param {function} [onFailure] - Called on error.
     */
    syncEmailKeypair: function(email, onComplete, onFailure) {
      prepareDeps();
      // jwcrypto depends on a random seed being set to generate a keypair.
      // The seed is set with a call to network.withContext.  Ensure the
      // random seed is set before continuing or else the seed may not be set,
      // the key never created, and the onComplete callback never called.
      network.withContext(function() {
        jwcrypto.generateKeypair({algorithm: "DS", keysize: bid.KEY_LENGTH}, function(err, keypair) {
          certifyEmailKeypair(email, keypair, onComplete, onFailure);
        });
      });
    },


    /**
     * Get an assertion for an identity
     * @method getAssertion
     * @param {string} email - Email to get assertion for.
     * @param {string} audience - Audience to use for the assertion.
     * @param {function} [onComplete] - Called with assertion, null otw.
     * @param {function} [onFailure] - Called on error.
     */
    getAssertion: function(email, audience, onComplete, onFailure) {
      function complete(status) {
        onComplete && onComplete(status);
      }

      var storedID = storage.getEmail(email),
        assertion,
        self=this;

      function createAssertion(idInfo) {
        // we use the current time from the browserid servers
        // to avoid issues with clock drift on user's machine.
        // (issue #329)
        network.serverTime(function(serverTime) {
          var sk = jwcrypto.loadSecretKeyFromObject(idInfo.priv);

          // assertions are valid for 2 minutes
          var expirationMS = serverTime.getTime() + (2 * 60 * 1000);
          var expirationDate = new Date(expirationMS);

          // yield to the render thread, important on IE8 so we don't
          // raise "script has become unresponsive" errors.
          setTimeout(function() {
            jwcrypto.assertion.sign(
              {}, {audience: audience, expiresAt: expirationDate},
              sk,
              function(err, signedAssertion) {
                assertion = jwcrypto.cert.bundle([idInfo.cert], signedAssertion);
                storage.site.set(audience, "email", email);
                complete(assertion);
              });
          }, 0);
        }, onFailure);
      }

      if (storedID) {
        prepareDeps();
        if (storedID.priv) {
          // parse the secret key
          // yield to the render thread!
          setTimeout(function() {
            createAssertion(storedID);
          }, 0);
        }
        else {
          // first we have to get the address info, then attempt
          // a provision, then if the user is provisioned, go and get an
          // assertion.
          User.addressInfo(email, function(info) {
            if (info.type === "primary") {
              User.provisionPrimaryUser(email, info, function(status) {
                if (status === "primary.verified") {
                  User.getAssertion(email, audience, onComplete, onFailure);
                }
                else {
                  complete(null);
                }
              }, onFailure);
            }
            else {
              // we have no key for this identity, go generate the key,
              // sync it and then get the assertion recursively.
              User.syncEmailKeypair(email, function(status) {
                User.getAssertion(email, audience, onComplete, onFailure);
              }, onFailure);
            }
          }, onFailure);
        }
      }
      else {
        complete(null);
      }
    },

    /**
     * Get the list of identities stored locally.
     * @method getStoredEmailKeypairs
     * @return {object} identities.
     */
    getStoredEmailKeypairs: function() {
      return storage.getEmails();
    },

    /**
     * Get the list of identities sorted by address.
     * @method getSortedEmailKeypairs
     * @return {array} of objects, with two fields, address, data
     */
    getSortedEmailKeypairs: function() {
      var identities = User.getStoredEmailKeypairs(),
          sortedIdentities = [];

      for(var key in identities) {
        if (identities.hasOwnProperty(key)) {
          sortedIdentities.push({ address: key, info: identities[key] });
        }
      }

      sortedIdentities.sort(function(a, b) {
        var retval = a.address > b.address ? 1 : a.address < b.address ? -1 : 0;
        return retval;
      });

      return sortedIdentities;
    },

    /**
     * Get an individual stored identity.
     * @method getStoredEmailKeypair
     * @return {object} identity information for email, if exists, undefined
     * otw.
     */
    getStoredEmailKeypair: function(email) {
      return storage.getEmail(email);
    },

    /**
     * Clear the list of identities stored locally.
     * @method clearStoredEmailKeypairs
     */
    clearStoredEmailKeypairs: function() {
      storage.clear();
    },

    /**
     * Get an assertion for the current domain if the user is signed into it
     * @method getSilentAssertion
     * @param {function} onComplete - called on completion.  Called with an
     * an email and assertion if successful, null otw.
     * @param {function} onFailure - called on XHR failure.
     */
    getSilentAssertion: function(siteSpecifiedEmail, onComplete, onFailure) {
      // XXX: why do we need to check authentication status here explicitly.
      //      why can't we fail later?  the problem with doing this is that
      //      knowing correct present authentication status requires that we
      //      talk to the server, because you can be logged in or logged out
      //      in many different contexts (dialog, manage page, cookies expire).
      //      so if we rely on localstorage only and check authentication status
      //      only when we know a network request will be required, we very well
      //      might have fewer race conditions and do fewer network requests.
      User.checkAuthenticationAndSync(function(authenticated) {
        if (authenticated) {
          var loggedInEmail = storage.getLoggedIn(origin);
          if (loggedInEmail !== siteSpecifiedEmail) {
            if (loggedInEmail) {
              User.getAssertion(loggedInEmail, origin, function(assertion) {
                onComplete(assertion ? loggedInEmail : null, assertion);
              }, onFailure);
            } else {
              onComplete(null, null);
            }
          } else {
            onComplete(loggedInEmail, null);
          }
        }
        else if (onComplete) {
          onComplete(null, null);
        }
      }, onFailure);
    },

    /**
     * Clear the persistent signin field for the current origin
     * @method logout
     * @param {function} onComplete - called on completion.  Called with
     * a boolean, true if successful, false otw.
     * @param {function} onFailure - called on XHR failure.
     */
    logout: function(onComplete, onFailure) {
      User.checkAuthentication(function(authenticated) {
        if (authenticated) {
          storage.setLoggedIn(origin, false);
        }

        if (onComplete) {
          onComplete(!!authenticated);
        }
      }, onFailure);
    },

    /**
     * Set whether the user owns the computer or not.
     * @method setComputerOwnershipStatus
     * @param {boolean} userOwnsComputer - true if user owns computer, false otw.
     * @param {function} onComplete - called on successful completion.
     * @param {function} onFailure - called on XHR failure.
     */
    setComputerOwnershipStatus: function(userOwnsComputer, onComplete, onFailure) {
      var userID = network.userid();
      if (typeof userID !== "undefined") {
        if (userOwnsComputer) {
          storage.usersComputer.setConfirmed(userID);
          network.prolongSession(onComplete, onFailure);
        }
        else {
          storage.usersComputer.setDenied(userID);
          complete(onComplete);
        }
      } else {
        complete(onFailure, "user is not authenticated");
      }
    },

    /**
     * Check if the user owns the computer
     * @method isUsersComputer
     */
    isUsersComputer: function(onComplete, onFailure) {
      var userID = network.userid();
      if (typeof userID !== "undefined") {
        complete(onComplete, storage.usersComputer.confirmed(userID));
      } else {
        complete(onFailure, "user is not authenticated");
      }
    },

    /**
     * Check whether the user should be asked if this is their computer
     * @method shouldAskIfUsersComputer
     */
    shouldAskIfUsersComputer: function(onComplete, onFailure) {
      var userID = network.userid();
      if (typeof userID !== "undefined") {
        // A user should never be asked if they completed an email
        // registration/validation in this dialog session.
        var shouldAsk = storage.usersComputer.shouldAsk(userID)
                        && !registrationComplete;
        complete(onComplete, shouldAsk);
      } else {
        complete(onFailure, "user is not authenticated");
      }
    },

    /**
     * Mark the transition state of this user as having been completed.
     * @method usedAddressAsPrimary
     */
    usedAddressAsPrimary: function(email, onComplete, onFailure) {
      network.usedAddressAsPrimary(email, onComplete, onFailure);
    }

  };

  // Set origin to default to the current domain.  Other contexts that use user.js,
  // like dialogs or iframes, will call setOrigin themselves to update this to
  // the origin of the of the RP.  On login.persona.org, it will remain the origin of
  // login.persona.org
  var currentOrigin = window.location.protocol + '//' + window.location.hostname;
  if (window.location.port) {
    currentOrigin += ':' + window.location.port;
  }
  User.setOrigin(currentOrigin);

  return User;
}());
