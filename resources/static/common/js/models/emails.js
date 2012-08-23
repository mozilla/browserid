/*jshint browser: true*/
/*globals BrowserID: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Models.Emails = (function() {
  "use strict";

  var bid = BrowserID,
      storage = bid.getStorage();

  function storeEmails(emails) {
    storage.emails = JSON.stringify(emails);
  }

  function getEmails() {
    try {
      var emails = JSON.parse(storage.emails || "{}");
      if (emails !== null)
        return emails;
    } catch(e) {
    }

    // if we had a problem parsing or the emails are null
    clear();
    return {};
  }

  function getEmailCount() {
    return _.size(getEmails());
  }

  function getEmail(email) {
    var ids = getEmails();

    return ids && ids[email];
  }

  function addEmail(email, obj) {
    var emails = getEmails();
    emails[email] = obj;
    storeEmails(emails);
  }

  function addPrimaryEmail(email, obj) {
    obj = obj || {};
    obj.type = "primary";
    addEmail(email, obj);
  }

  function addSecondaryEmail(email, obj) {
    obj = obj || {};
    obj.type = "secondary";
    addEmail(email, obj);
  }

  function removeEmail(email) {
    var emails = getEmails();
    if(emails[email]) {
      delete emails[email];
      storeEmails(emails);

      // remove any sites associated with this email address.
      var siteInfo = JSON.parse(storage.siteInfo || "{}");
      for(var site in siteInfo) {
        if(siteInfo[site].email === email) {
          delete siteInfo[site].email;
        }
      }
      storage.siteInfo = JSON.stringify(siteInfo);
    }
    else {
      throw "unknown email address";
    }
  }

  function invalidateEmail(email) {
    var id = getEmail(email);
    if (id) {
      delete id.priv;
      delete id.pub;
      delete id.cert;
      addEmail(email, id);
    }
    else {
      throw "unknown email address";
    }
  }


  return {
    /**
     * Add an email address and optional key pair.
     * @method addEmail
     */
    addEmail: addEmail,
    /**
     * Add a primary address
     * @method addPrimaryEmail
     */
    addPrimaryEmail: addPrimaryEmail,
    /**
     * Add a secondary address
     * @method addSecondaryEmail
     */
    addSecondaryEmail: addSecondaryEmail,
    /**
     * Get all email addresses and their associated key pairs
     * @method getEmails
     */
    getEmails: getEmails,

    /**
     * Get the number of stored emails
     * @method getEmailCount
     * @return {number}
     */
    getEmailCount: getEmailCount,

    /**
     * Get one email address and its key pair, if found.  Returns undefined if
     * not found.
     * @method getEmail
     */
    getEmail: getEmail,
    /**
     * Remove an email address, its key pairs, and any sites associated with
     * email address.
     * @throws "unknown email address" if email address is not known.
     * @method removeEmail
     */
    removeEmail: removeEmail,
    /**
     * Remove the key information for an email address.
     * @throws "unknown email address" if email address is not known.
     * @method invalidateEmail
     */
    invalidateEmail: invalidateEmail,
  };

}());

