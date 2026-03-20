const { body } = require('express-validator');

exports.createResumeRules = [
  body('name').optional().trim(),
  body('profile.id').optional().isString().withMessage('profile.id must be a string'),
  body('profileId').optional().isString().withMessage('profileId must be a string'),
  body('summary').optional().isString().withMessage('summary must be a string'),
  body('experiences').optional().isArray().withMessage('experiences must be an array'),
  body('skills').optional().isArray().withMessage('skills must be an array'),
];

exports.generateResumeRules = [
  body('jdId').notEmpty().withMessage('jdId is required'),
  body('profileId').notEmpty().withMessage('profileId is required'),
];

exports.refineResumeRules = [
  body('resumeContent').notEmpty().withMessage('resumeContent is required'),
  body('feedback').notEmpty().withMessage('feedback is required'),
];

exports.jdParsingRules = [
  body('profileId').notEmpty().withMessage('profileId is required'),
  body('context').optional().isString(),
  body('text').optional().isString(),
];
