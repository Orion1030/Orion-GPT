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
  .get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), getAccountProfile)
  .patch(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), updateAccountProfile)
router.route('/metrics').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), getAccountUsageMetrics)
router.route('/page-access').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), getPageAccessRules)
router.route('/password').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), changePassword)

module.exports = router
