const { body } = require('express-validator');

exports.signupRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
];

exports.signinRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('password').notEmpty().withMessage('Password is required'),
];
