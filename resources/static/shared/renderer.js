/*jshint browsers:true, forin: true, laxbreak: true */
/*global BrowserID: true, _: true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
BrowserID.Renderer = (function() {
  "use strict";

  var bid = BrowserID,
      dom = bid.DOM,
      templateCache = {};

  function getTemplateHTML(templateName, vars) {
    var config,
        templateText = bid.Templates[templateName];

    if(templateText) {
      config = {
        text: templateText
      };
    }
    else {
      // TODO - be able to set the directory
      config = {
        url: "/dialog/views/" + templateName + ".ejs"
      };
    }
    // TODO(aok) Do caching like EJS below
    if (vars) {
      var params = {
            "domain" : "client",
            "locale_data" : json_locale_data
      };
      var gt = new Gettext(params);
      vars['gettext'] = gt.gettext.bind(gt);
      vars['strargs'] = gt.strargs.bind(gt);
    }

    var template = templateCache[templateName];
    if(!template) {
      template = new EJS(config);
      templateCache[templateName] = template;
    }

    var html = template.render(vars);
    return html;
  }

  function render(target, templateName, vars) {
    var html = getTemplateHTML(templateName, vars);
    return dom.setInner(target, html);
  }

  function append(target, templateName, vars) {
    var html = getTemplateHTML(templateName, vars);
    return dom.appendTo(html, target);
  }

  return {
    render: render,
    append: append
  };
}());
