/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
  "use strict";

  var nav = navigator,
      bid = BrowserID,
      internal = bid.internal = bid.internal || {},
      user = bid.User,
      storage = bid.Storage,
      network = bid.Network,
      helpers = bid.Helpers,
      moduleManager = bid.module;

  network.init();
  network.clearContext();


  // given an object containing an assertion, extract the assertion string,
  // as the internal API is supposed to return a string assertion, not an
  // object.  issue #1395

  function assertionObjectToString(assertion) {
    if (assertion !== null && typeof assertion === 'object' && assertion.assertion) {
      assertion = assertion.assertion;
    }
    return assertion;
  }

  /**
   * Set the persistent flag to true for an origin.
   * @method setPersistent
   * @param {string} origin
   * @param {callback} [callback] - callback to call when complete.  Called
   * with true if successful, null if user is not authenticated or failure.
   */
  internal.setPersistent = function(origin, callback) {
    function complete(status) {
      callback && callback(status);
    }

    user.checkAuthentication(function onComplete(authenticated) {
      if (authenticated) {
        storage.site.set(origin, "remember", true);
      }

      complete(!!authenticated || null);
    }, complete.curry(null));
  };

  /**
   * Get an assertion.  Mimics the behavior of navigator.id.get.
   * options.silent defaults to false.  To get an assertion without using the
   * dialog, set options.silent to true.  To specify a required email, set
   * options.requiredEmail. By specifying both silent:true and requiredEmail:
   * <email>, an assertion will be attempted to be retreived for the given
   * email without showing the dialog.
   * @method get
   * @param {string} origin
   * @param {function} callback - called when complete.  Called with assertion
   * if success, null if the user cancels.  Other conditions causing null
   * return value: silent is true and user is not authenticated.  silent is
   * true, requiredEmail is specified but user does not control email.
   * @param {object} options.  See options block for navigator.id.get.
   * options.silent defaults to false.
   */
  internal.get = function(origin, callback, options) {
    if (typeof options === 'string') {
      // Firefox forbids sending objects across the blood-brain barrier from
      // gecko into userland JS.  So we just stringify and destringify our
      // objects when calling from b2g native code.
      options = JSON.parse(options);
    }

    function complete(assertion) {
      assertion = assertionObjectToString(assertion);
      // If no assertion, give no reason why there was a failure.
      callback && callback(assertion || null);
    }

    // Make our own copy, since we assign properties to it.
    // There was an error doing that in B2G, since we got a
    // WrappsJSObject.
    options = _.extend({}, options);

    var silent = !!options.silent;
    if(silent) {
      // first, check the required email field, if that is not specified, go
      // check if an email is associated with this site. If that is not
      // available, there is not enough information to continue.
      var requiredEmail = options.requiredEmail || storage.site.get(origin, "email");
      if(requiredEmail) {
        getSilent(origin, requiredEmail, callback);
      }
      else {
        complete();
      }
    }
    else {
      // Use the standard dialog facilities to get the assertion, pass the
      // options block directly to the dialog.
      options.rp_api = "internal";
      get(origin, options, complete);
    }
  };

  function get(origin, options, complete) {
    var args = arguments;
    var controller;

    // The dialog startup is asynchronous and the dialog module may not yet be
    // registered by the time BrowserID.internal.get is called. If the module
    // is not yet ready, keep polling until it is. Note, if the user's cookies
    // are disabled, this poll will continue into eternity.
    try {
      controller = moduleManager.getRunningModule("dialog");
    } catch (noModule) {
      return setTimeout(function _get_wait() {
        get.apply(null, args);
      }, 50);
    }

    controller.get(origin, options, complete, complete);
  }

  function setOrigin(origin) {
    user.setOrigin(origin);
    // B2G and marketplace use special issuers that disable primaries. Go see
    // if the current domain uses a special issuer, if it does, set the issuer
    // in user.js.
    var issuer = storage.site.get(user.getOrigin(), "issuer");
    if (issuer) {
      user.setIssuer(issuer);
    }
  }

  /*
   * Get an assertion without user interaction - internal use
   */
  function getSilent(origin, email, callback) {
    function complete(assertion) {
      assertion = assertionObjectToString(assertion);
      callback && callback(assertion || null);
    }

    setOrigin(origin);

    user.checkAuthenticationAndSync(function(authenticated) {
      // User must be authenticated to get an assertion.
      if(authenticated) {
        user.getAssertion(email, user.getOrigin(), function(assertion) {
          complete(assertion || null);
        }, complete.curry(null));
      }
      else {
        complete(null);
      }
    }, complete.curry(null));
  }

  /**
   * Log the user out of the current origin
   * @method logout
   * @param {string} origin
   * @param {function} callback
   */
  internal.logout = function(origin, callback) {
    function complete(status) {
      callback && callback(status);
    }

    setOrigin(origin);
    user.logout(callback, complete.curry(null));
  };

  /**
   * Log the user out everywhere
   * @method logoutEveywhere
   * @param {function} callback
   */
  internal.logoutEverywhere = function(callback) {
    function complete(success) {
      callback && callback(status);
    }

    user.logoutUser(callback, complete.curry(null));
  };

  internal.watch = function (callback, options, log) {
    if (typeof options === 'string') options = JSON.parse(options);
    internalWatch(callback, options, log);
  };


  function internalWatch (callback, options, log) {
    var bid = BrowserID,
        user = bid.User,
        storage = bid.Storage;

    log = log || helpers.log;

    log('internal watch options', options);
    var remoteOrigin = options.origin;
    var loggedInUser = options.loggedInUser;
    setOrigin(remoteOrigin);

    function checkAndEmit() {
      log('checking and emitting');
      // this will re-certify the user if neccesary
      user.getSilentAssertion(loggedInUser, function(email, assertion) {
        if (email) {
          // only send login events when the assertion is defined - when
          // the 'loggedInUser' is already logged in, it's false - that is
          // when the site already has the user logged in and does not want
          // the resources or cost required to generate an assertion
          if (assertion) doLogin(assertion);
          loggedInUser = email;
        } else if (loggedInUser !== null) {
          // only send logout events when loggedInUser is not null, which is an
          // indicator that the site thinks the user is logged out
          doLogout();
          loggedInUser = null;
        }
        doReady();
      }, function(err) {
        log('silent return: err', err);
        doLogout();
        loggedInUser = null;
        doReady();
      }, log);
    }

    checkAndEmit();

    function doReady (params) {
      log('doReady');
      callback({ method: 'ready' });
    }

    function doLogin (params) {
      log('doLogin (with silent assertion)');
      // Through the _internalParams, we signify to any RP callers that are
      // interested that this assertion was acquired without user interaction.
      callback({ method: 'login', assertion: params, _internalParams: {silent: true} });
    }

    function doLogout () {
      log('doLogout');
      if (loggedInUser !== null) {
        storage.setLoggedIn(remoteOrigin, false);
        callback({ method: 'logout' });
      }
    }
  }

}());
