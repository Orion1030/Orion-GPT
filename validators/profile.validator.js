const { body } = require('express-validator');

const FLEXIBLE_DATE_PATTERN = /^(\d{4}|\d{4}-(0[1-9]|1[0-2])|\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/;
const FLEXIBLE_DATE_MESSAGE = 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD';
const DATE_RANGE_MESSAGE = 'End date must be on or after start date';

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

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function toFlexibleDateBound(value, bound) {
  const normalized = String(value || '').trim();
  if (!normalized || !FLEXIBLE_DATE_PATTERN.test(normalized)) return null;

  const parts = normalized.split('-');
  const year = Number(parts[0]);
  if (Number.isNaN(year)) return null;

  if (parts.length === 1) {
    const month = bound === 'start' ? 1 : 12;
    const day = bound === 'start' ? 1 : 31;
    return Date.UTC(year, month - 1, day);
  }

  const month = Number(parts[1]);
  if (Number.isNaN(month) || month < 1 || month > 12) return null;

  if (parts.length === 2) {
    const day = bound === 'start' ? 1 : getDaysInMonth(year, month);
    return Date.UTC(year, month - 1, day);
  }

  const day = Number(parts[2]);
  if (Number.isNaN(day)) return null;
  return Date.UTC(year, month - 1, day);
}

function isFlexibleDateRangeOrdered(startDate, endDate) {
  const startBound = toFlexibleDateBound(startDate, 'start');
  const endBound = toFlexibleDateBound(endDate, 'end');
  if (startBound == null || endBound == null) return true;
  return startBound <= endBound;
}

function getArrayIndexFromPath(path) {
  if (typeof path !== 'string') return -1;
  const bracketMatch = path.match(/\[(\d+)\]/);
  if (bracketMatch) return Number(bracketMatch[1]);
  const dotMatch = path.match(/\.(\d+)\./);
  if (dotMatch) return Number(dotMatch[1]);
  return -1;
}

function validateDateRangeInArray(arrayField, startField) {
  return (endDate, { req, path }) => {
    const normalizedEnd = String(endDate || '').trim();
    if (!normalizedEnd) return true;

    const index = getArrayIndexFromPath(path);
    if (index < 0) return true;

    const list = Array.isArray(req.body?.[arrayField]) ? req.body[arrayField] : [];
    const entry = list[index] || {};
    const startDate = entry[startField];
    const normalizedStart = String(startDate || '').trim();
    if (!normalizedStart) return true;

    if (!isFlexibleDateValue(normalizedStart) || !isFlexibleDateValue(normalizedEnd)) {
      return true;
    }

    return isFlexibleDateRangeOrdered(normalizedStart, normalizedEnd);
  };
}

exports.createProfileRules = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('contactInfo.email').optional().isEmail().withMessage('Invalid email format'),
  body('contactInfo.linkedin').optional().isURL({ require_protocol: true }).withMessage('LinkedIn must be a valid URL').or(body('contactInfo.linkedin').equals('')),
  body('careerHistory').optional().isArray().withMessage('Career history must be an array'),
  body('careerHistory.*.startDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
  body('careerHistory.*.endDate')
    .optional({ nullable: true })
    .custom(isFlexibleDateValue)
    .withMessage(FLEXIBLE_DATE_MESSAGE)
    .bail()
    .custom(validateDateRangeInArray('careerHistory', 'startDate'))
    .withMessage(DATE_RANGE_MESSAGE),
  body('educations').optional().isArray().withMessage('Educations must be an array'),
  body('educations.*.startDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
  body('educations.*.endDate')
    .optional({ nullable: true })
    .custom(isFlexibleDateValue)
    .withMessage(FLEXIBLE_DATE_MESSAGE)
    .bail()
    .custom(validateDateRangeInArray('educations', 'startDate'))
    .withMessage(DATE_RANGE_MESSAGE),
];

exports.updateProfileRules = [
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('contactInfo.email').optional().isEmail().withMessage('Invalid email format'),
  body('careerHistory').optional().isArray().withMessage('Career history must be an array'),
  body('careerHistory.*.startDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
  body('careerHistory.*.endDate')
    .optional({ nullable: true })
    .custom(isFlexibleDateValue)
    .withMessage(FLEXIBLE_DATE_MESSAGE)
    .bail()
    .custom(validateDateRangeInArray('careerHistory', 'startDate'))
    .withMessage(DATE_RANGE_MESSAGE),
  body('educations').optional().isArray().withMessage('Educations must be an array'),
  body('educations.*.startDate').optional({ nullable: true }).custom(isFlexibleDateValue).withMessage(FLEXIBLE_DATE_MESSAGE),
  body('educations.*.endDate')
    .optional({ nullable: true })
    .custom(isFlexibleDateValue)
    .withMessage(FLEXIBLE_DATE_MESSAGE)
    .bail()
    .custom(validateDateRangeInArray('educations', 'startDate'))
    .withMessage(DATE_RANGE_MESSAGE),
];
