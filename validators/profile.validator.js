const { body } = require('express-validator');

const FLEXIBLE_DATE_PATTERN = /^(\d{4}|\d{4}-(0[1-9]|1[0-2])|\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/;
const FLEXIBLE_DATE_MESSAGE = 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD';

function isFlexibleDateValue(value) {
  if (value == null || value === '') return true;

  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  const normalized = String(value).trim();
  if (!normalized) return true;
  if (FLEXIBLE_DATE_PATTERN.test(normalized)) return true;

  // Allow legacy datetime payloads during transition.
  const looksLikeLegacyDateTime =
    /T\d{2}:\d{2}/.test(normalized) ||
    /GMT|UTC/.test(normalized) ||
    /^[A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{4}/.test(normalized);

  if (!looksLikeLegacyDateTime) return false;

  const parsed = new Date(normalized);
  return !Number.isNaN(parsed.getTime());
}

exports.createProfileRules = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('contactInfo.email').optional().isEmail().withMessage('Invalid email format'),
  body('contactInfo.linkedin').optional().isURL({ require_protocol: true }).withMessage('LinkedIn must be a valid URL').or(body('contactInfo.linkedin').equals('')),
  body('careerHistory').optional().isArray().withMessage('Career history must be an array'),
  body('careerHistory.*.startDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
  body('careerHistory.*.endDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
  body('educations').optional().isArray().withMessage('Educations must be an array'),
  body('educations.*.startDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
  body('educations.*.endDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
];

exports.updateProfileRules = [
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('contactInfo.email').optional().isEmail().withMessage('Invalid email format'),
  body('careerHistory').optional().isArray().withMessage('Career history must be an array'),
  body('careerHistory.*.startDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
  body('careerHistory.*.endDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
  body('educations').optional().isArray().withMessage('Educations must be an array'),
  body('educations.*.startDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
  body('educations.*.endDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
];
