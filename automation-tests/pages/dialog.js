const CSS = require('./css.js'),
    utils = require('../lib/utils.js')

function verifyOpts(optionList, opts) {
  optionList.forEach(function(required) {
    if (!opts[required]) throw ("Error: missing required argument '"+required+"'");
  });
}

exports.signInAsNewUser = function(opts, cb) {
  verifyOpts(['email', 'browser', 'password'], opts);
  var browser = opts.browser;
  browser.chain({onError: cb})
    .wtype(CSS['dialog'].emailInput, opts.email)
    .wsubmit(CSS['dialog'].newEmailNextButton)
    .wtype(CSS['dialog'].choosePassword, opts.password)
    .wtype(CSS['dialog'].verifyPassword, opts.password)
    .wsubmit(CSS['dialog'].createUserButton, cb);
};

exports.signInExistingUser = function(opts, cb) {
  verifyOpts(['email', 'browser', 'password'], opts);
  var browser = opts.browser;
  browser.chain({onError: cb})
    .wtype(CSS['dialog'].emailInput, opts.email)
    .wsubmit(CSS['dialog'].newEmailNextButton)
    .wtype(CSS['dialog'].existingPassword, opts.password)
    .wsubmit(CSS['dialog'].returningUserButton)
    .wclickIfExists(CSS['dialog'].notMyComputerButton, cb);
};
