const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, clearTemplates, seedTemplates, migrateBuiltInTemplates } = require('../controllers/template.controller')

const router = express.Router()
router.route('/seed').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), seedTemplates)
router.route('/migrate').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), migrateBuiltInTemplates)
router.route('/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getTemplates)
router.route('/').post(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), createTemplate)
router.route('/').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), clearTemplates)
router.route('/:id').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getTemplate)
router.route('/:id').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), updateTemplate)
router.route('/:id').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), deleteTemplate)


module.exports = router
