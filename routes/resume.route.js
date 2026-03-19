const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const {
  getAllResumes, getResume, getResumeByProfileAndId,
  createResume, updateResume, deleteResume, clearResume,
  downloadResume, downloadResumeFromHtml, parseTextResume,
  importJdAndMatch, generateResumeFromJD, refineResume,
} = require('../controllers/resume.controller')
const { requireNoRunningJob, requireNoRunningJobOfType } = require('../middlewares/requireNoRunningJob')

const router = express.Router()

const auth = [isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User])]

router.route('/').get(...auth, getAllResumes)
router.route('/').post(...auth, createResume)
router.route('/').delete(...auth, clearResume)

router.route('/download/:resumeId').get(...auth, downloadResume)
router.route('/download/:resumeId').post(...auth, downloadResumeFromHtml)

router.route('/by-profile/:profileId/:resumeId').get(...auth, getResumeByProfileAndId)

// Static-segment routes must come before /:resumeId to avoid param capture
router.route('/parse-text').post(...auth, parseTextResume)

// JD-based resume flow (used by resume creation UI; not part of chat)
// Each route blocks only on job types that would conflict with its work.
router.post('/jdparsing',       ...auth, requireNoRunningJobOfType('parse_jd', 'generate_resume'), importJdAndMatch)
router.post('/generate-resume', ...auth, requireNoRunningJobOfType('generate_resume'),             generateResumeFromJD)
router.post('/refine-resume',   ...auth, refineResume)

// Parameterised routes last
router.route('/:resumeId').get(...auth, getResume)
router.route('/:resumeId').put(...auth, updateResume)
router.route('/:resumeId').delete(...auth, deleteResume)

module.exports = router
