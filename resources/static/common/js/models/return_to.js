/*jshint browser: true*/
/*globals BrowserID: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Models.ReturnTo = (function() {
  "use strict";

  var bid = BrowserID,
      storage = bid.getStorage();

  function setReturnTo(returnToURL) {
    storage.returnTo = JSON.stringify({
      at: new Date().toString(),
      url: returnToURL
    });
  }

  function getReturnTo() {
    var returnToURL;

    // XXX - The transitional code is to make sure any emails that were staged using
    // the old setStagedOnBehalfOf still work with the new API.  This should be
    // able to be removed by mid-July 2012.
    try {
      // BEGIN TRANSITIONAL CODE
      if (storage.returnTo) {
      // END TRANSITIONAL CODE
        var staged = JSON.parse(storage.returnTo);

        if (staged) {
          if ((new Date() - new Date(staged.at)) > (5 * 60 * 1000)) throw "stale";
          if (typeof(staged.url) !== 'string') throw "malformed";
          returnToURL = staged.url;
        }
      // BEGIN TRANSITIONAL CODE
      }
      else if(storage.stagedOnBehalfOf) {
        var staged = JSON.parse(storage.stagedOnBehalfOf);

        if (staged) {
          if ((new Date() - new Date(staged.at)) > (5 * 60 * 1000)) throw "stale";
          if (typeof(staged.origin) !== 'string') throw "malformed";
          returnToURL = staged.origin;
        }
      }
      // END TRANSITIONAL CODE
    } catch (x) {
      storage.removeItem("returnTo");
      // BEGIN TRANSITIONAL CODE
      storage.removeItem("stagedOnBehalfOf");
      // END TRANSITIONAL CODE
    }

    return returnToURL;
  }

  var ReturnTo = {
    setReturnTo: setReturnTo,
    getReturnTo: getReturnTo
  };

  return ReturnTo;

}());

