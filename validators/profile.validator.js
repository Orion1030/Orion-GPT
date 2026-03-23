const { body } = require('express-validator');

exports.createProfileRules = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('contactInfo.email').optional().isEmail().withMessage('Invalid email format'),
  body('contactInfo.linkedin').optional().isURL({ require_protocol: true }).withMessage('LinkedIn must be a valid URL').or(body('contactInfo.linkedin').equals('')),
  body('careerHistory').optional().isArray().withMessage('Career history must be an array'),
  body('educations').optional().isArray().withMessage('Educations must be an array'),
];

exports.updateProfileRules = [
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('contactInfo.email').optional().isEmail().withMessage('Invalid email format'),
  body('careerHistory').optional().isArray().withMessage('Career history must be an array'),
  body('educations').optional().isArray().withMessage('Educations must be an array'),
];
