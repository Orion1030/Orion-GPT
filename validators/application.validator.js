const { body, query } = require('express-validator')
const {
  APPLICATION_STATUS,
  GENERATION_STATUS,
  PROFILE_SELECTION_MODES,
  RESUME_REFERENCE_MODES,
} = require('../services/applicationContract')

exports.applyRules = [
  body('jdContext')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('jdContext is required')
    .isLength({ max: 100 * 1024 })
    .withMessage('jdContext exceeds 100KB limit'),
  body('resumeReferenceMode')
    .optional()
    .isIn(RESUME_REFERENCE_MODES)
    .withMessage(`resumeReferenceMode must be one of: ${RESUME_REFERENCE_MODES.join(', ')}`),
  body('profileSelectionMode')
    .optional()
    .isIn(PROFILE_SELECTION_MODES)
    .withMessage(`profileSelectionMode must be one of: ${PROFILE_SELECTION_MODES.join(', ')}`),
  body('manualProfileId')
    .optional({ nullable: true })
    .isString()
    .withMessage('manualProfileId must be a string'),
  body('manualResumeId')
    .optional({ nullable: true })
    .isString()
    .withMessage('manualResumeId must be a string'),
  body('selectedTemplateId')
    .optional({ nullable: true })
    .isString()
    .withMessage('selectedTemplateId must be a string'),
  body()
    .custom((value) => {
      const profileSelectionMode = value?.profileSelectionMode
      const manualProfileId = value?.manualProfileId
      if (profileSelectionMode === 'manual' && (!manualProfileId || !String(manualProfileId).trim())) {
        throw new Error('manualProfileId is required when profileSelectionMode=manual')
      }
      return true
    }),
  body()
    .custom((value) => {
      const resumeReferenceMode = value?.resumeReferenceMode
      const manualResumeId = value?.manualResumeId
      if (resumeReferenceMode === 'use_specific_resume' && (!manualResumeId || !String(manualResumeId).trim())) {
        throw new Error('manualResumeId is required when resumeReferenceMode=use_specific_resume')
      }
      return true
    }),
]

exports.listRules = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('pageSize must be between 1 and 200'),
  query('sort')
    .optional()
    .isIn(['-createdAt', 'createdAt', '-updatedAt', 'updatedAt'])
    .withMessage('sort must be one of: -createdAt, createdAt, -updatedAt, updatedAt'),
  query('q')
    .optional()
    .isString()
    .withMessage('q must be a string'),
  query('status')
    .optional()
    .isIn(APPLICATION_STATUS)
    .withMessage(`status must be one of: ${APPLICATION_STATUS.join(', ')}`),
  query('generationStatus')
    .optional()
    .isIn(GENERATION_STATUS)
    .withMessage(`generationStatus must be one of: ${GENERATION_STATUS.join(', ')}`),
]

exports.patchRules = [
  body('resumeName')
    .optional()
    .isString()
    .withMessage('resumeName must be a string'),
  body('companyName')
    .optional()
    .isString()
    .withMessage('companyName must be a string'),
  body('jobTitle')
    .optional()
    .isString()
    .withMessage('jobTitle must be a string'),
  body('applicationStatus')
    .optional()
    .isIn(APPLICATION_STATUS)
    .withMessage(`applicationStatus must be one of: ${APPLICATION_STATUS.join(', ')}`),
  body('jdMeta')
    .optional()
    .isObject()
    .withMessage('jdMeta must be an object'),
  body('jdMeta.jobType')
    .optional()
    .isIn(['full_time', 'part_time', 'permanent', 'contract', 'internship', 'other'])
    .withMessage('jdMeta.jobType is invalid'),
  body('jdMeta.workType')
    .optional()
    .isIn(['remote', 'hybrid', 'on_site', 'other'])
    .withMessage('jdMeta.workType is invalid'),
  body('jdMeta.salary')
    .optional()
    .isObject()
    .withMessage('jdMeta.salary must be an object'),
  body('jdMeta.salary.salaryType')
    .optional()
    .isIn(['hourly', 'annual'])
    .withMessage('jdMeta.salary.salaryType must be hourly or annual'),
  body('jdMeta.salary.min')
    .optional()
    .isNumeric()
    .withMessage('jdMeta.salary.min must be numeric'),
  body('jdMeta.salary.max')
    .optional()
    .isNumeric()
    .withMessage('jdMeta.salary.max must be numeric'),
  body()
    .custom((value) => {
      const salary = value?.jdMeta?.salary
      if (!salary) return true
      if (salary.min != null && salary.max != null && Number(salary.min) > Number(salary.max)) {
        throw new Error('jdMeta.salary.min must be less than or equal to jdMeta.salary.max')
      }
      return true
    }),
]

exports.historyQueryRules = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('pageSize must be between 1 and 200'),
]
