/*jshint browsers:true, forin: true, laxbreak: true */
/*global steal: true, test: true, start: true, stop: true, module: true, ok: true, equal: true, BrowserID:true */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla BrowserID.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */
steal.plugins("jquery").then("/dialog/controllers/page_controller", 
                             "/dialog/controllers/unsupported_controller", function() {
  "use strict";

  var controller, el;

  function reset() {
    el = $("#controller_head");
    el.find("#formWrap .contents").html("");
    el.find("#wait .contents").html("");
    el.find("#error .contents").html("");
  }

  module("Unsupported Controller", {
    setup: function() {
      reset();
    },

    teardown: function() {
      controller.destroy();
      reset();
    } 
  });

  test("unsupported controller with no options", function() {
    controller = el.unsupported().controller();
    ok(controller, "A controller has been created");


    var html = el.find(".contents").html();
    ok(html.length, "a template has been written");

    var ie = el.find("#ie");
    equal(ie.length, 0, "the IE specific message not found");
  });

  test("unsupported controller with the reason: IE_VERSION option", function() {
    controller = el.unsupported({
      reason: "IE_VERSION" 
    }).controller();
    ok(controller, "A controller has been created");


    var html = el.find(".contents").html();
    ok(html.length, "a template has been written");

    var ie = el.find("#ie");
    ok(ie.length, "the IE specific message found");
  });
});

