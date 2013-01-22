/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module creates the required configuration for connect-fonts.
 * It converts from the format given in config/fonts.json to the format
 * expected by connect-fonts.
 *
 * The expected format can be found at:
 * https://github.com/shane-tomlinson/connect-fonts/blob/master/README.md
 *
 * Two fields are exported, fonts and locale_to_subdirs.
 * fonts is the font configuration expected by connect-fonts,
 * locale_to_subdirs returns a mapping of locale->directory where the
 * fonts for a locale are located.
 *
 */

const
fs = require("fs"),
path = require("path");

function loadJSON(path) {
  var jsonStr = fs.readFileSync(path, "utf8");
  // strip out any comments
  jsonStr = jsonStr.replace(/\/\/.*/g, "");
  return JSON.parse(jsonStr);
}

function getFontConfig() {
  return loadJSON(path.join(__dirname, "..", "config", "fonts.json"));
}

function getSortedSubdirectories(locales) {
  var subdirs = {};

  for (var locale in locales) {
    subdirs[locales[locale]] = true;
  }

  return Object.keys(subdirs).sort();
}

function addLocalFonts(inputFontConfig, outputFontConfig) {
  if (inputFontConfig.local) {
    for (var i = 0, localName; localName = inputFontConfig.local[i]; ++i) {
      outputFontConfig.formats.push({
        type: "local",
        url: localName
      });
    }
  }
}

function generateConfig() {
  var config = getFontConfig();
  var fonts = config.fonts;
  var outputConfig = {};
  var subdirs = getSortedSubdirectories(config.locale_to_subdirs);

  for (var fontName in fonts) {
    var inputFontConfig = fonts[fontName];
    var outputFontConfig = {
      fontFamily: inputFontConfig.fontFamily,
      fontStyle: inputFontConfig.fontStyle,
      fontWeight: inputFontConfig.fontWeight,
      formats: []
    };

    addLocalFonts(inputFontConfig, outputFontConfig);

    var root = config.root;
    var fontTypes = config["font-types"];
    for (var type in fontTypes) {
      var extension = fontTypes[type];
      var format = {
        type: type,
        url: {}
      };

      for (var j = 0, subdir; subdir = subdirs[j]; ++j) {
        format.url[subdir] = root + subdir + "/" + fontName + "." + extension;
      }

      outputFontConfig.formats.push(format);
    }

    outputConfig[fontName] = outputFontConfig;
  }

  return outputConfig;

}

exports.fonts = generateConfig();
exports.locale_to_subdirs = getFontConfig().locale_to_subdirs;


