const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { requirePageAccess } = require('../middlewares/pageAccess.middleware')
const { RoleLevels } = require('../utils/constants')
const { PAGE_ACCESS_KEYS } = require('../utils/pageAccess')
const { getWhitelistItemById, getWhitelistItemBySiteName, getWhitelists, updateWhitelistById, clearWhitelists, createWhitelistItem, deleteWhitelistItemById, deleteWhitelistItemBySiteName, addApplySelectorBySiteName } = require('../controllers/whitelist.controller')

const router = express.Router()
const accessGuard = requirePageAccess(PAGE_ACCESS_KEYS.WHITELIST)

router.route('/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), accessGuard, getWhitelists)
router.route('/').post(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), accessGuard, createWhitelistItem)
router.route('/').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), accessGuard, clearWhitelists)
router.route('/:id').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), accessGuard, getWhitelistItemById)
router.route('/:id').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), accessGuard, deleteWhitelistItemById)
router.route('/:id').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), accessGuard, updateWhitelistById)
router.route('/item/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), accessGuard, getWhitelistItemBySiteName)
router.route('/item/').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), accessGuard, addApplySelectorBySiteName)
router.route('/item/').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), accessGuard, deleteWhitelistItemBySiteName)

module.exports = router
