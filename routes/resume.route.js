const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { requirePageAccess } = require('../middlewares/pageAccess.middleware')
const { RoleLevels } = require('../utils/constants')
const { PAGE_ACCESS_KEYS } = require('../utils/pageAccess')
const {
  getAllResumes, getResume, getResumeByProfileAndId,
  createResume, updateResume, deleteResume, deleteResumes,
  downloadResume, downloadResumeFromHtml,
} = require('../controllers/resume.controller')
const {
  parseTextResume, importJdAndMatch, generateResumeFromJD, refineResume,
  parseJdAndMatchProfiles, matchResumesForProfile, getLastUsedJd,
} = require('../controllers/resumeAI.controller')
const { requireNoRunningJob, requireNoRunningJobOfType } = require('../middlewares/requireNoRunningJob')
const { createResumeRules, generateResumeRules, refineResumeRules, jdParsingRules, parseJdRules, matchResumesRules } = require('../validators/resume.validator')
const { validate } = require('../middlewares/validate')

const router = express.Router()

const auth = [
  isAuthenticatedUser,
  permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]),
  requirePageAccess(PAGE_ACCESS_KEYS.RESUMES),
]

router.route('/').get(...auth, getAllResumes)
router.route('/').post(...auth, createResumeRules, validate, createResume)
router.route('/').delete(...auth, deleteResumes)

router.route('/download/:resumeId').get(...auth, downloadResume)
router.route('/download/:resumeId').post(...auth, downloadResumeFromHtml)

router.route('/by-profile/:profileId/:resumeId').get(...auth, getResumeByProfileAndId)

// Static-segment routes must come before /:resumeId to avoid param capture
router.route('/parse-text').post(...auth, parseTextResume)

// JD-based resume flow (used by resume creation UI; not part of chat)
// Each route blocks only on job types that would conflict with its work.

// New JD-first wizard: parse JD → suggest profiles → select profile → match resumes → generate
router.get('/last-jd',         ...auth, getLastUsedJd)
router.post('/parse-jd',        ...auth, parseJdRules, validate, requireNoRunningJobOfType('parse_jd'), parseJdAndMatchProfiles)
router.post('/match-resumes',   ...auth, matchResumesRules, validate, matchResumesForProfile)

// Legacy combined flow (kept for backwards compatibility)
router.post('/jdparsing',       ...auth, jdParsingRules, validate, requireNoRunningJobOfType('parse_jd', 'generate_resume'), importJdAndMatch)
router.post('/generate-resume', ...auth, generateResumeRules, validate, requireNoRunningJobOfType('generate_resume'), generateResumeFromJD)
router.post('/refine-resume',   ...auth, refineResumeRules, validate, refineResume)

// Parameterised routes last
router.route('/:resumeId').get(...auth, getResume)
router.route('/:resumeId').put(...auth, updateResume)
router.route('/:resumeId').delete(...auth, deleteResume)

module.exports = router
