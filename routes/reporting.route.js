const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const { changeMemberPassword } = require('../controllers/admin.controller')
const { getResume, getAllResumes, createResume, updateResume, deleteResume, uploadResume, clearResume } = require('../controllers/resume.controller')

const router = express.Router()
router.route('/password').put(isAuthenticatedUser, permit([RoleLevels.ADMIN]), changeMemberPassword)
router.route('/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getAllResumes)
router.route('/').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), createResume)
router.route('/:resumeId').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getResume)
router.route('/:resumeId').put(isAuthenticatedUser, permit([RoleLevels.ADMIN]), updateResume)
router.route('/:resumeId').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), deleteResume)
router.route('/upload').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), uploadResume)
router.route('/').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), clearResume)

module.exports = router
