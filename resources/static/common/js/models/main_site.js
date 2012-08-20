/*jshint browser: true*/
/*globals BrowserID: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Models.MainSite = (function() {
  "use strict";

  var bid = BrowserID,
      storage = bid.getStorage();

  function generic2KeySet(namespace, key, value) {
    var allInfo = JSON.parse(storage[namespace] || "{}");
    allInfo[key] = value;
    storage[namespace] = JSON.stringify(allInfo);
  }

  function generic2KeyGet(namespace, key) {
    var allInfo = JSON.parse(storage[namespace] || "{}");
    return allInfo[key];
  }

  function generic2KeyRemove(namespace, key) {
    var allInfo = JSON.parse(storage[namespace] || "{}");
    delete allInfo[key];
    storage[namespace] = JSON.stringify(allInfo);
  }

  return {
    manage_page: {
      /**
       * Set a data field for the manage page
       * @method managePage.set
       */
      set: generic2KeySet.curry("managePage"),
      get: generic2KeyGet.curry("managePage"),
      remove: generic2KeyRemove.curry("managePage")
    },
    signInEmail: {
      set: generic2KeySet.curry("main_site", "signInEmail"),
      get: generic2KeyGet.curry("main_site", "signInEmail"),
      remove: generic2KeyRemove.curry("main_site", "signInEmail")
    }
  };

}());

