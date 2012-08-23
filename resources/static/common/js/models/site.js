/*jshint browser: true*/
/*globals BrowserID: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Models.Site = (function() {
  "use strict";

  var bid = BrowserID,
      storage = bid.getStorage(),
      Emails = bid.Models.Emails;

  function siteSet(site, key, value) {
    var allSiteInfo = JSON.parse(storage.siteInfo || "{}");
    var siteInfo = allSiteInfo[site] = allSiteInfo[site] || {};

    if(key === "email" && !Emails.getEmail(value)) {
      throw "unknown email address";
    }

    siteInfo[key] = value;

    storage.siteInfo = JSON.stringify(allSiteInfo);
  }

  function siteGet(site, key) {
    var allSiteInfo = JSON.parse(storage.siteInfo || "{}");
    var siteInfo = allSiteInfo[site];

    return siteInfo && siteInfo[key];
  }

  function siteRemove(site, key) {
    var allSiteInfo = JSON.parse(storage.siteInfo || "{}");
    var siteInfo = allSiteInfo[site];

    if (siteInfo) {
      delete siteInfo[key];

      // If no more info for site, get rid of it.
      if (!_.size(siteInfo)) delete allSiteInfo[site];

      storage.siteInfo = JSON.stringify(allSiteInfo);
    }
  }

  function siteCount(callback) {
    var allSiteInfo = JSON.parse(storage.siteInfo || "{}");
    return _.size(allSiteInfo);
  }

  var Site = {
    /**
     * Set a data field for a site
     * @method site.set
     * @param {string} site - site to set info for
     * @param {string} key - key to set
     * @param {variant} value - value to set
     */
    set: siteSet,
    /**
     * Get a data field for a site
     * @method site.get
     * @param {string} site - site to get info for
     * @param {string} key - key to get
     */
    get: siteGet,
    /**
     * Remove a data field for a site
     * @method site.remove
     * @param {string} site - site to remove info for
     * @param {string} key - key to remove
     */
    remove: siteRemove,

    /**
     * Get the number of sites that have info
     * @method site.count
     * @return {number}
     */
    count: siteCount,
  };

  return Site;

}());

