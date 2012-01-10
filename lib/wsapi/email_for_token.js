const
db = require('../db.js');

/* First half of account creation.  Stages a user account for creation.
 * this involves creating a secret url that must be delivered to the
 * user via their claimed email address.  Upon timeout expiry OR clickthrough
 * the staged user account transitions to a valid user account
 */

exports.method = 'get';
exports.writes_db = false;
exports.authed = false;
exports.args = ['token'];

exports.process = function(req, res) {
  db.emailForVerificationSecret(req.query.token, function(err, r) {
    if (err) {
      res.json({
        success: false,
        reason: err
      });
    } else {
      res.json({
        success: true,
        email: r.email,
        needs_password: r.needs_password
      });
    }
  });
};
