#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


const
fs = require("fs"),
path = require('path'),
resources = require('../lib/static_resources.js'),
templates = require('../lib/templates'),
cachify = require('connect-cachify'),
connect_fonts = require('connect-fonts'),
config = require('../lib/configuration');

var existsSync = fs.existsSync || path.existsSync;
var dir = process.cwd();
var output_dir = process.env.BUILD_DIR || dir;

function loadJSON(path) {
  var jsonStr = fs.readFileSync(path, "utf8");
  // strip out any comments
  jsonStr = jsonStr.replace(/\/\/.*/g, "");
  return JSON.parse(jsonStr);
}

function getRegisteredFonts() {
  return loadJSON(__dirname + "/../config/fonts.json");
}

function getLanguageToLocations() {
  return loadJSON(__dirname + "/../config/language-font-types.json");
}

cachify.setup({}, {
  prefix: config.get('cachify_prefix'),
  root: path.join(__dirname, '/../resources/static')
});

connect_fonts.setup({
  fonts: getRegisteredFonts(),
  language_to_locations: getLanguageToLocations(),
  url_modifier: cachify.cachify
});


function generateCSS() {
  var langs = config.get('supported_languages');
  var all = resources.all(langs);

  for (var key in all) {
    if (/\.css$/.test(key)) {
      var deps = all[key];

      deps.forEach(function(dep) {
        if (/fonts\.css$/.test(dep)) {
          var parts = dep.split('/');
          var lang = parts[1];
          var fonts = parts[2].split(',');
          var ua = "all";

          connect_fonts.generate_css(ua, lang, fonts, function(err, css) {
            var css_output_path = path.join(output_dir, dep);
            var css_output_dir = path.dirname(css_output_path);

            // create any missing directories.
            var dir_parts = css_output_dir.split('/');
            root = "";
            for(var i = 1, dir; dir = dir_parts[i]; ++i) {
              root += ("/" + dir);
              if (!existsSync(root)) {
                fs.mkdirSync(root);
              }
            }
            // finally, write out the file.
            fs.writeFileSync(css_output_path, css.css, "utf8");
          });
        }
      });
    }
  }
}

// run or export the function
if (process.argv[1] === __filename) generateCSS();
else module.exports = generateCSS;
