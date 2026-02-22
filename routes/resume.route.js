const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const { getAllResumes, getResume, updateResume, deleteResume, clearResume, downloadResume } = require('../controllers/resume.controller')

const router = express.Router()
router.route('/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getAllResumes)
router.route('/').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), createResume)
router.route('/').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), clearResume)
router.route('/:resumeId').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getResume)
router.route('/:resumeId').put(isAuthenticatedUser, permit([RoleLevels.ADMIN]), updateResume)
router.route('/:resumeId').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), deleteResume)
// TODO: router.route('/upload').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), uploadResume)
router.route('/download/:resumeId').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), downloadResume)

module.exports = router
