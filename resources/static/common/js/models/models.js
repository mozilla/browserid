/*globals BrowserID: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

BrowserID.Models = {};
BrowserID.getStorage = function() {
  var storage;

  try {
    storage = localStorage;
  }
  catch(e) {
    // Fx with cookies disabled will except while trying to access
    // localStorage.  IE6/IE7 will just plain blow up because they have no
    // notion of localStorage.  Because of this, and because the new API
    // requires access to localStorage, create a fake one with removeItem.
    storage = {
      removeItem: function(key) {
        this[key] = null;
        delete this[key];
      }
    };
  }

  return storage;
};


