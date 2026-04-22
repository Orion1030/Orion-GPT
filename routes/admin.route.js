const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const {
  changeMemberPassword,
  getUser,
  getUsageMetrics,
  getUsageMetricsForUser,
  listUsers,
  resetUserPassword,
  updateUser,
} = require('../controllers/admin.controller')
const { patchPageAccessRule } = require('../controllers/pageAccess.controller')

const router = express.Router()
router.route('/metrics').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getUsageMetrics)
router.route('/metrics/:userId').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getUsageMetricsForUser)
router.route('/users').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), listUsers)
router.route('/users/:userId').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getUser).patch(isAuthenticatedUser, permit([RoleLevels.ADMIN]), updateUser)
router.route('/users/:userId/reset-password').put(isAuthenticatedUser, permit([RoleLevels.ADMIN]), resetUserPassword)
router.route('/page-access/:pageKey').patch(isAuthenticatedUser, permit([RoleLevels.ADMIN]), patchPageAccessRule)
router.route('/password').put(isAuthenticatedUser, permit([RoleLevels.ADMIN]), changeMemberPassword)

module.exports = router
