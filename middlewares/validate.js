const { validationResult } = require('express-validator');
const { sendJsonResult } = require('../utils');

/**
 * Run after express-validator chains. Returns 400 with first error if any.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return sendJsonResult(res, false, null, first.msg, 400);
  }
  next();
}

module.exports = { validate };
