const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const { getWhitelistItemById, getWhitelistItemBySiteName, getWhitelists, updateWhitelistById, clearWhitelists, createWhitelistItem, deleteWhitelistItemById, deleteWhitelistItemBySiteName, addApplySelectorBySiteName } = require('../controllers/whitelist.controller')

const router = express.Router()
router.route('/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), getWhitelists)
router.route('/').post(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), createWhitelistItem)
router.route('/').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), clearWhitelists)
router.route('/:id').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getWhitelistItemById)
router.route('/:id').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), deleteWhitelistItemById)
router.route('/:id').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), updateWhitelistById)
router.route('/item/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getWhitelistItemBySiteName)
router.route('/item/').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), addApplySelectorBySiteName)
router.route('/item/').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), deleteWhitelistItemBySiteName)

module.exports = router
