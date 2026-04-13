const express = require('express')
const { changePassword, getAccountUsageMetrics } = require('../controllers/user.controller')
require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')

const router = express.Router()
router.route('/metrics').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getAccountUsageMetrics)
router.route('/password').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.User]), changePassword)

module.exports = router
