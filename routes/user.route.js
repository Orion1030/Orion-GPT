const express = require('express')
const {
  changePassword,
  getAccountUsageMetrics,
  getAccountProfile,
  updateAccountProfile,
} = require('../controllers/user.controller')
const { getPageAccessRules } = require('../controllers/pageAccess.controller')
require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')

const router = express.Router()
router.route('/me')
  .get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getAccountProfile)
  .patch(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), updateAccountProfile)
router.route('/metrics').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getAccountUsageMetrics)
router.route('/page-access').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getPageAccessRules)
router.route('/password').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), changePassword)

module.exports = router
