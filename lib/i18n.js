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

/*
 * i18n-abide
 * 
 * This module abides by the user's language preferences and makes it
 * available throughout the app.
 * 
 * This module abides by the Mozilla L10n way of doing things.
 * 
 * The module abides.
 * 
 * See docs/I18N.md for details.
 */

var logger = require('./logging.js').logger,
    Gettext = require('node-gettext'),
    path = require('path'),
    util = require('util');

const BIDI_RTL_LANGS = ['ar', 'fa', 'he'];

/**
 * Connect middleware which is i18n aware.
 * 
 * Usage:
  app.use(i18n.abide({
    supported_languages: ['en-US', 'fr', 'pl'],
    default_lang: 'en-US',
    locale_directory: 'locale'
  }));
 *
 * Other valid options: gettext_alias, ngettext_alias
 */
exports.abide = function (options) {

  if (! options.gettext_alias)       options.gettext_alias = 'gettext';
  if (! options.ngettext_alias)      options.ngettext_alias = 'ngettext';
  if (! options.supported_languages) options.supported_languages = ['en-US'];
  if (! options.default_lang)        options.default_lang = 'en-US';
  if (! options.locale_directory)    options.locale_directory = 'locale';

  return function(req, resp, next) {
    var langs = parseAcceptLanguage(req.headers['accept-language']),
        lang_dir,
        lang = bestLanguage(langs, options.supported_languages, 
                            options.default_lang),
        locale;

    resp.local('lang', lang);

    logger.info('Setting lang=' + lang + ' for this request');

    // BIDI support, which direction does text flow?
    lang_dir = BIDI_RTL_LANGS.indexOf(lang) >= 0 ? 'rtl' : 'ltr';
    resp.local('lang_dir', lang_dir);
    req.lang = lang;

    locale = localeFrom(lang);
    resp.local('locale', locale);
    req.locale = locale;

    // Thread saftey, app startup or per request?
    gt = new Gettext();

    // app startup ???
    mo_path = path.join(__dirname, '..', options.locale_directory, locale, 
                        'LC_MESSAGES', 'messages.mo');

    if (path.existsSync(mo_path)) {
      gt.addTextdomain(locale, fs.readFileSync(mo_path));

      // Per request ???
      gt.textdomain(locale);
      console.info("Putting " + options.gettext_alias);
      resp.local(options.gettext_alias, gt.gettext.bind(gt));
      req.gettext = gt.gettext.bind(gt);
      resp.local(options.ngettext_alias, gt.ngettext.bind(gt));
      req.ngettext = gt.ngettext.bind(gt);
   } else {
      // TODO if in development mode, warn... production error
      logger.error('Bad language=' + lang + ' or locale=' + locale + 
                   ' mo file does not exist. [' + mo_path + ']');
      var identity = function (a, b) { return a; };
      resp.local(options.gettext_alias, identity);
      req.gettext = identity;
      resp.local(options.ngettext_alias, identity);
      req.ngettext = identity;
    }
    next();
  };
};
function qualityCmp(a, b) {
  if (a.quality == b.quality) {
    return 0;
  } else if (a.quality < b.quality) {
    return 1;
  } else {
    return -1;
  }
};

/**
 * Parses the HTTP accept-language header and returns a
 * sorted array of objects. Example object:
 * {
 *   lang: 'pl', quality: 0.7
 * }
 */
exports.parseAcceptLanguage = parseAcceptLanguage = function (header) {
    // pl,fr-FR;q=0.3,en-US;q=0.1
    if (! header || ! header.split) {
      return [];
    }
    var raw_langs = header.split(',');
    var langs = raw_langs.map(function (raw_lang) {
      var parts = raw_lang.split(';');
      var q = 1;
      if (parts.length > 1 && parts[1].indexOf('q=') == 0) {
          qval = parseFloat(parts[1].split('=')[1]);
          if (isNaN(qval) === false) {
            q = qval;
          }
      }
      return { lang: parts[0].trim(), quality: q };
    });
    langs.sort(qualityCmp);
    return langs;
};


 // Given the user's prefered languages and a list of currently
 // supported languages, returns the best match or a default language.
 // 
 // languages must be a sorted list, the first match is returned.
function bestLanguage(languages, supported_languages, defaultLanguage) {
  var lower = supported_languages.map(function (l) { return l.toLowerCase(); });
  for(var i=0; i < languages.length; i++) {
    var lq = languages[i];
    if (lower.indexOf(lq.lang.toLowerCase()) !== -1) {
      return lq.lang;
    }
  }
  return defaultLanguage;
};

/**
 * Given a language code, return a locale code the OS understands.
 *
 * language: en-US
 * locale:   en_US
 */
exports.localeFrom = localeFrom = function (language) {
  if (! language || ! language.split) {
      return "";
  }
  var parts = language.split('-');
  if (parts.length === 1) {
    return parts[0].toLowerCase();
  } else if (parts.length === 2) {
    return util.format('%s_%s', parts[0].toLowerCase(), parts[1].toUpperCase());
  } else if (parts.length === 3) {
    // sr-Cyrl-RS should be sr_RS
    return util.format('%s_%s', parts[0].toLowerCase(), parts[2].toUpperCase());
  } else {
    logger.error(util.format("Unable to map a local from language code [%s]", language));
    return language;
  }
};