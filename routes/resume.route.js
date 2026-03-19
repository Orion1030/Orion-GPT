const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const { getAllResumes, getResume, getResumeByProfileAndId, createResume, updateResume, deleteResume, clearResume, downloadResume, downloadResumeFromHtml, parseTextResume, importJdAndMatch, generateResumeFromJD, refineResume } = require('../controllers/resume.controller')
const { requireNoRunningJob } = require('../middlewares/requireNoRunningJob')

const router = express.Router()
router.route('/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getAllResumes)
router.route('/').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), createResume)
router.route('/').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), clearResume)
router.route('/download/:resumeId').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), downloadResume)
router.route('/download/:resumeId').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), downloadResumeFromHtml)
router.route('/by-profile/:profileId/:resumeId').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getResumeByProfileAndId)
router.route('/:resumeId').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getResume)
router.route('/:resumeId').put(isAuthenticatedUser, permit([RoleLevels.ADMIN]), updateResume)
router.route('/:resumeId').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), deleteResume)
router.route('/parse-text').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), parseTextResume)

// JD-based resume flow (used by resume creation UI; not part of chat)
router.post('/jdparsing', isAuthenticatedUser, permit([RoleLevels.ADMIN]), requireNoRunningJob, importJdAndMatch)
router.post('/generate-resume', isAuthenticatedUser, permit([RoleLevels.ADMIN]), requireNoRunningJob, generateResumeFromJD)
router.post('/refine-resume', isAuthenticatedUser, permit([RoleLevels.ADMIN]), requireNoRunningJob, refineResume)

module.exports = router
