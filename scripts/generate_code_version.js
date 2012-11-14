const
fs = require('fs'),
path = require('path'),
// TODO version async, but provides no callback when version() value changes
// In dev mode, can cause different SHA between client and server
version = require('../lib/version.js');

module.exports = function () {
  var codeVersionPath = path.join(__dirname, "..", "resources", "static", "build", "code_version.js");
  var contents = "window.CODE_SHA = '" + version() + "';\n";
  fs.writeFileSync(codeVersionPath, contents, 'utf8', function (err) {
    if (err) console.error(err);
  });
};