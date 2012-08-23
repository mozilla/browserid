/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*globals BrowserID: true, console: true */
BrowserID.Storage = (function() {
  "use strict";

  var jwcrypto,
      bid = BrowserID,
      storage = bid.getStorage(),
      Models = bid.Models,
      Emails = Models.Emails,
      Site = Models.Site,
      UsersComputer = Models.UsersComputer,
      EmailToUserID = Models.EmailToUserID,
      LoggedIn = Models.LoggedIn,
      ReturnTo = Models.ReturnTo,
      MainSite = Models.MainSite;

  // Set default values immediately so that IE8 localStorage synchronization
  // issues do not become a factor. See issue #2206
  setDefaultValues();

  function clear() {
    storage.removeItem("emails");
    storage.removeItem("siteInfo");
    storage.removeItem("managePage");
    // Ensure there are default values after they are removed.  This is
    // necessary so that IE8's localStorage synchronization issues do not
    // surface.  In IE8, if the dialog page is open when the verification page
    // loads and emails does not have a default value, the dialog cannot read
    // or write to localStorage. The dialog See issues #1637 and #2206
    setDefaultValues();
  }

  // initialize all localStorage values to default if they are unset.
  // this function is only neccesary on IE8 where there are localStorage
  // synchronization issues between different browsing contexts, however
  // it's intended to avoid IE8 specific bugs from being introduced.
  // see issue #1637
  function setDefaultValues() {
    _.each({
      emailToUserID: {},
      emails: {},
      interaction_data: {},
      loggedIn: {},
      main_site: {},
      managePage: {},
      returnTo: null,
      siteInfo: {},
      stagedOnBehalfOf: null,
      usersComputer: {}
    }, function(defaultVal, key) {
      if (!storage[key]) {
        storage[key] = JSON.stringify(defaultVal);
      }
    });
  }

  var Storage = {
    site: Site,

    usersComputer: UsersComputer,

    /**
     * Clear all stored data - email addresses, key pairs, temporary key pairs,
     * site/email associations.
     * @method clear
     */
    clear: clear,
    /**
     * Set all used storage values to default if they are unset.  This function
     * is required for proper localStorage sync between different browsing contexts,
     * see issue #1637 for full details.
     * @method setDefaultValues
     */
    setDefaultValues: setDefaultValues
  };

  _.extend(Storage, Emails);
  _.extend(Storage, EmailToUserID);
  _.extend(Storage, LoggedIn);
  _.extend(Storage, ReturnTo);
  _.extend(Storage, MainSite);

  return Storage;
}());
