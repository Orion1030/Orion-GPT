const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { requirePageAccess } = require('../middlewares/pageAccess.middleware')
const { RoleLevels } = require('../utils/constants')
const { PAGE_ACCESS_KEYS } = require('../utils/pageAccess')
const { getBlacklists, addToBlacklist, removeFromBlacklist, clearBlacklists } = require('../controllers/blacklist.controller')

const router = express.Router()
const accessGuard = requirePageAccess(PAGE_ACCESS_KEYS.BLACKLIST)

router.get('/', isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.User, RoleLevels.Manager, RoleLevels.GUEST]), accessGuard, getBlacklists)
router.post('/', isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.User, RoleLevels.Manager, RoleLevels.GUEST]), accessGuard, addToBlacklist)
router.delete('/', isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.User, RoleLevels.Manager, RoleLevels.GUEST]), accessGuard, removeFromBlacklist)
router.delete('/clear', isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.User, RoleLevels.Manager]), accessGuard, clearBlacklists)

module.exports = router
