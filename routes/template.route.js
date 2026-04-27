const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { requirePageAccess } = require('../middlewares/pageAccess.middleware')
const { RoleLevels } = require('../utils/constants')
const { PAGE_ACCESS_KEYS } = require('../utils/pageAccess')
const { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, clearTemplates, seedTemplates, migrateBuiltInTemplates } = require('../controllers/template.controller')

const router = express.Router()
const accessGuard = requirePageAccess(PAGE_ACCESS_KEYS.TEMPLATES)
router.route('/seed').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), seedTemplates)
router.route('/migrate').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), migrateBuiltInTemplates)
router.route('/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), accessGuard, getTemplates)
router.route('/').post(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), accessGuard, createTemplate)
router.route('/').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), accessGuard, clearTemplates)
router.route('/:id').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), accessGuard, getTemplate)
router.route('/:id').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), accessGuard, updateTemplate)
router.route('/:id').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), accessGuard, deleteTemplate)


module.exports = router
