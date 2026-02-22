const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const { getBlacklists, addToBlacklist, removeFromBlacklist, clearBlacklists } = require('../controllers/blacklist.controller')

const router = express.Router()

router.get('/', isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.User, RoleLevels.Manager]), getBlacklists)
router.post('/', isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.User, RoleLevels.Manager]), addToBlacklist)
router.delete('/', isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.User, RoleLevels.Manager]), removeFromBlacklist)
router.delete('/clear', isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.User, RoleLevels.Manager]), clearBlacklists)

module.exports = router
