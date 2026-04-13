const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const {
  changeMemberPassword,
  getUsageMetrics,
  getUsageMetricsForUser,
  listUsers,
  updateUser,
} = require('../controllers/admin.controller')
const { patchPageAccessRule } = require('../controllers/pageAccess.controller')

const router = express.Router()
router.route('/metrics').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getUsageMetrics)
router.route('/metrics/:userId').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), getUsageMetricsForUser)
router.route('/users').get(isAuthenticatedUser, permit([RoleLevels.ADMIN]), listUsers)
router.route('/users/:userId').patch(isAuthenticatedUser, permit([RoleLevels.ADMIN]), updateUser)
router.route('/page-access/:pageKey').patch(isAuthenticatedUser, permit([RoleLevels.ADMIN]), patchPageAccessRule)
router.route('/password').put(isAuthenticatedUser, permit([RoleLevels.ADMIN]), changeMemberPassword)

module.exports = router
