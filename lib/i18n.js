/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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

const BIDI_RTL_LANGS = ['ar', 'eo', 'fa', 'he'];

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

    // TODO(aok): Check if we're not in production mode before switching eo to db-LB
    // Must fix before Esperanto could ship.
    if (lang == 'eo') {
        lang = 'db-LB'; // What? http://www.youtube.com/watch?v=rJLnGjhPT1Q
    }

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

    resp.local('strargs', strargs);
    req.strargs = strargs;

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
      // TODO if in development mode, warn, test ignore and production error
      /* logger.error('Bad language=' + lang + ' or locale=' + locale +
                   ' mo file does not exist. [' + mo_path + ']'); */
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

/**
 * Copied from `resources/static/shared/gettext.js`, so we can use the
 * same method name on node.js and client-side.
 */
exports.strargs = strargs = function (str, args) {
    // make sure args is an array
    if ( null == args ||
         'undefined' == typeof(args) ) {
        args = [];
    } else if (args.constructor != Array) {
        args = [args];
    }

    // NOTE: javascript lacks support for zero length negative look-behind
    // in regex, so we must step through w/ index.
    // The perl equiv would simply be:
    //    $string =~ s/(?<!\%)\%([0-9]+)/$args[$1]/g;
    //    $string =~ s/\%\%/\%/g; # restore escaped percent signs

    var newstr = "";
    while (true) {
        var i = str.indexOf('%');
        var match_n;

        // no more found. Append whatever remains
        if (i == -1) {
            newstr += str;
            break;
        }

        // we found it, append everything up to that
        newstr += str.substr(0, i);

        // check for escpaed %%
        if (str.substr(i, 2) == '%%') {
            newstr += '%';
            str = str.substr((i+2));

        // % followed by number
        } else if ( match_n = str.substr(i).match(/^%(\d+)/) ) {
            var arg_n = parseInt(match_n[1]);
            var length_n = match_n[1].length;
            if ( arg_n > 0 && args[arg_n -1] != null && typeof(args[arg_n -1]) != 'undefined' )
                newstr += args[arg_n -1];
            str = str.substr( (i + 1 + length_n) );

        // % followed by some other garbage - just remove the %
        } else {
            newstr += '%';
            str = str.substr((i+1));
        }
    }

    return newstr;
};