/*jshint browsers:true, forin: true, laxbreak: true */
/*global test: true, start: true, stop: true, module: true, ok: true, equal: true, BrowserID:true */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
(function() {
  "use strict";

  var controller,
      bid = BrowserID,
      user = bid.User,
      testHelpers = bid.TestHelpers,
      register = bid.TestHelpers.register,
      WindowMock = bid.Mocks.WindowMock,
      RP_HOSTNAME = "hostname.org",
      RP_NAME = "RP Name",
      RP_HTTPS_LOGO = "https://en.gravatar.com/userimage/6966791/c4feac761b8544cce13e0406f36230aa.jpg",
      RP_HTTP_LOGO = "http://en.gravatar.com/userimage/6966791/c4feac761b8544cce13e0406f36230aa.jpg";

  module("controllers/rp_info", {
    setup: testHelpers.setup,

    teardown: function() {
      if (controller) {
        try {
          controller.destroy();
          controller = null;
        } catch(e) {
          // could already be destroyed from the close
        }
      }
      testHelpers.teardown();
    }
  });


  function createController(options) {
    options = _.extend({ hostname: RP_HOSTNAME }, options);

    controller = bid.Modules.RPInfo.create();
    controller.start(options || {});
  }

  test("neither name nor logo specified - use site's rp_hostname as sitename", function() {
    createController();
    equal($("#rp_hostname").text(), RP_HOSTNAME, "rp_hostname filled in");
    ok(!$("#rp_name").text(), "rp_name empty");
    ok(!$("#rp_logo").attr("src"), "rp logo not shown");
  });

  test("name only specified - show specified name and rp_hostname", function() {
    createController({
      name: RP_NAME,
    });

    equal($("#rp_hostname").text(), RP_HOSTNAME, "rp_hostname filled in");
    equal($("#rp_name").text(), RP_NAME, "rp_hostname filled in");
    ok(!$("#rp_logo").attr("src"), "rp logo not shown");
  });

  test("if document is http, http logoURLs are allowed", function() {
    var docMock = new WindowMock().document;
    docMock.location.protocol = "http:";

    createController({
      document: docMock,
      logoURL: RP_HTTP_LOGO
    });

    equal($("#rp_logo").attr("src"), RP_HTTP_LOGO, "rp logo shown");
    equal($("#rp_hostname").text(), RP_HOSTNAME, "rp_hostname filled in");
    ok(!$("#rp_name").text(), "rp_name empty");
  });

  test("if document is http, https logoURLs are allowed", function() {
    var docMock = new WindowMock().document;
    docMock.location.protocol = "http:";

    createController({
      document: docMock,
      logoURL: RP_HTTPS_LOGO
    });

    equal($("#rp_logo").attr("src"), RP_HTTPS_LOGO, "rp logo shown");
    equal($("#rp_hostname").text(), RP_HOSTNAME, "rp_hostname filled in");
    ok(!$("#rp_name").text(), "rp_name empty");
  });

  test("if document is https, http logoURLs not allowed", function() {
    var docMock = new WindowMock().document;
    docMock.location.protocol = "https:";

    createController({
      document: docMock,
      logoURL: RP_HTTP_LOGO
    });

    testHelpers.testErrorVisible();
  });

  test("if document is https, https logoURLs are allowed", function() {
    var docMock = new WindowMock().document;
    docMock.location.protocol = "https:";

    createController({
      document: docMock,
      logoURL: RP_HTTPS_LOGO
    });

    equal($("#rp_logo").attr("src"), RP_HTTPS_LOGO, "rp logo shown");
  });

  test("logoURL without origin not allowed", function() {
    createController({
      logoURL: "/url_without_location"
    });

    testHelpers.testErrorVisible();
  });

  test("logoURL with data-uris not allowed", function() {
    createController({
      logoURL: "data:image/png;base64,somefakedata"
    });

    testHelpers.testErrorVisible();
  });

  test("both name and logo specified - show name, logo and rp_hostname", function() {
    createController({
      name: RP_NAME,
      logoURL: RP_HTTPS_LOGO
    });

    equal($("#rp_hostname").text(), RP_HOSTNAME, "rp_hostname filled in");
    equal($("#rp_name").text(), RP_NAME, "rp_hostname filled in");
    equal($("#rp_logo").attr("src"), RP_HTTPS_LOGO, "rp logo shown");
  });

  test("html stripped from name", function() {
    createController({
      name: "<div id='badjiji' onmouseover='alert(\"You have been owned\")')>" + RP_NAME + "</div>"
    });

    equal($("#rp_name").text(), RP_NAME, "rp_hostname filled in");
  });

}());

