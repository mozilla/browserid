/*jshint browser: true*/
/*globals  */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Models.EmailToUserID = (function() {
  "use strict";

  var bid = BrowserID,
      storage = bid.getStorage();

  function mapEmailToUserID(emailOrUserID) {
    if (typeof(emailOrUserID) === 'number') return emailOrUserID;
    var allInfo = JSON.parse(storage.emailToUserID || "{}");
    return allInfo[emailOrUserID];
  }

  // update our local storage based mapping of email addresses to userids,
  // this map helps us determine whether a specific email address belongs
  // to a user who has already confirmed their ownership of a computer.
  function updateEmailToUserIDMapping(userid, emails) {
    var allInfo;
    try {
      allInfo = JSON.parse(storage.emailToUserID);
      if (typeof allInfo != 'object' || allInfo === null) throw "bogus";
    } catch(e) {
      allInfo = {};
    }
    _.each(emails, function(email) {
      allInfo[email] = userid;
    });
    storage.emailToUserID = JSON.stringify(allInfo);
  }

  var EmailToUserID = {
    mapEmailToUserID: mapEmailToUserID,
    updateEmailToUserIDMapping: updateEmailToUserIDMapping
  };

  return EmailToUserID;

}());

