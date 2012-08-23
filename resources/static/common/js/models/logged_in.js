/*jshint browser: true*/
/*globals BrowserID: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Models.LoggedIn = (function() {
  "use strict";

  var bid = BrowserID,
      storage = bid.getStorage();

  function setLoggedIn(origin, email) {
    var allInfo = JSON.parse(storage.loggedIn || "{}");
    if (email) allInfo[origin] = email;
    else delete allInfo[origin];
    storage.loggedIn = JSON.stringify(allInfo);
  }

  function getLoggedIn(origin) {
    var allInfo = JSON.parse(storage.loggedIn || "{}");
    return allInfo[origin];
  }

  function loggedInCount() {
    var allInfo = JSON.parse(storage.loggedIn || "{}");
    return _.size(allInfo);
  }

  function watchLoggedIn(origin, callback) {
    var lastState = getLoggedIn(origin);

    function checkState() {
      var currentState = getLoggedIn(origin);
      if (lastState !== currentState) {
        callback();
        lastState = currentState;
      }
    }

    // IE8 does not have addEventListener, nor does it support storage events.
    if (window.addEventListener) window.addEventListener('storage', checkState, false);
    else window.setInterval(checkState, 2000);
  }

  function logoutEverywhere() {
    storage.loggedIn = "{}";
  }


  var LoggedIn = {
    /** set logged in state for a site
     * @param {string} origin - the site to set logged in state for
     * @param {string} email - the email that the user is logged in with or falsey if login state should be cleared
     */
    setLoggedIn: setLoggedIn,

    /** check if the user is logged into a site
     * @param {string} origin - the site to set check the logged in state of
     * @returns the email with which the user is logged in
     */
    getLoggedIn: getLoggedIn,

    /**
     * Get the number of sites the user is logged in to.
     * @method loggedInCount
     * @return {number}
     */
    loggedInCount: loggedInCount,

    /** watch for changes in the logged in state of a page
     * @param {string} origin - the site to watch the status of
     * @param {function} callback - a callback to invoke when state changes
     */
    watchLoggedIn: watchLoggedIn,

    /** clear all logged in preferences
     * @param {string} origin - the site to watch the status of
     * @param {function} callback - a callback to invoke when state changes
     */
    logoutEverywhere: logoutEverywhere,
  };

  return LoggedIn;

}());

