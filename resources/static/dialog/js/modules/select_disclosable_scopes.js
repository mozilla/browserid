/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Modules.SelectDisclosableScopes = (function() {
  "use strict";

  var bid = BrowserID,
      dom = bid.DOM,
      user = bid.User,
      errors = bid.Errors,
      helpers = bid.Helpers,
      domHelpers = bid.DOMHelpers,
      BODY_SELECTOR = "body",
      SELECT_DISCLOSABLE_SCOPES_CLASS = "disclosescopes",
      SCREEN_SELECTOR = "#wait",
      SKIN_CLASS = "black";

  function selectScopeByElementId(id) {
    dom.setAttr("#selectScopes input[id=" + id + "]", "checked", true);
  }

  function deselectScopeByElementId(id) {
    dom.setAttr("#selectScopes input[id=" + id + "]", "checked", false);
  }

  function isScopeSelectedByElementId(id) {
    return !!dom.getAttr("#selectScopes input[id=" + id + "]", "checked");
  }

  function onScopeSelect(event) {
    var id = dom.getAttr(event.target, 'id');
    if (event.target.checked) {
      selectScopeByElementId(id);
    } else {
      deselectScopeByElementId(id);
    }
  }

  var Module = bid.Modules.PageModule.extend({
    start: function(options) {
      var self = this;

      options = options || {};

      self.checkRequired(options, 'disclosableAttrs', 'rpInfo');

      //self.hideWarningScreens();

      dom.addClass(BODY_SELECTOR, SELECT_DISCLOSABLE_SCOPES_CLASS);

      var rpInfo = options.rpInfo;
      var requiredScopes = rpInfo.getRequiredScopes() || [];
      var optionalScopes = rpInfo.getOptionalScopes() || [];
      var previouslyDisclosedScopes = user.getSiteDisclosableScopes(rpInfo.getOrigin()) || [];

      if (_.indexOf(optionalScopes, '*') !== -1) {
        // offer all available scopes if the wildcard was requested
        self.disclosableAttrs = options.disclosableAttrs;
      } else {
        var allScopes = _.union(requiredScopes, optionalScopes, previouslyDisclosedScopes);

        // offer all available scopes that the RP desires or that we previously disclosed
        self.disclosableAttrs = helpers.whitelistFilter(options.disclosableAttrs, allScopes);
      }

      self.renderForm("select_disclosable_scopes", {
        siteName: rpInfo.getSiteName(),
        attrs: self.disclosableAttrs
      });

      // preselect any scopes that are required by the RP
      _.each(self.disclosableAttrs, function(disclosableAttr, disclosableAttrScope) {
        if (_.indexOf(requiredScopes, disclosableAttrScope) !== -1)
          selectScopeByElementId("scope_" + disclosableAttrScope);
      });

      self.bind("#selectScopes input[type=checkbox]", "click", onScopeSelect);
      self.click("#discloseScopes", self.discloseScopes);

      Module.sc.start.call(self, options);
    },

    stop: function() {
      Module.sc.stop.call(this);
      dom.removeClass(BODY_SELECTOR, SELECT_DISCLOSABLE_SCOPES_CLASS);
    },

    discloseScopes: function(status) {
      var self = this;
      var disclosedScopes = [];

      _.each(self.disclosableAttrs, function(disclosableAttr, disclosableAttrScope) {
        if (isScopeSelectedByElementId("scope_" + disclosableAttrScope)) {
          disclosedScopes.push(disclosableAttrScope);
        }
      });

      self.publish("disclosable_scopes_set", { disclosedScopes: disclosedScopes });
    }
  });

  return Module;

}());
