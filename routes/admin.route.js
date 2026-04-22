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
const {
  addTeamMembers,
  createTeam,
  deleteTeam,
  listAssignableUsers,
  listTeamMembers,
  listTeams,
  removeTeamMember,
  updateTeam,
} = require('../controllers/team.controller')

const router = express.Router()
router
  .route('/metrics')
  .get(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    getUsageMetrics
  )
router
  .route('/metrics/:userId')
  .get(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    getUsageMetricsForUser
  )
router
  .route('/users')
  .get(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    listUsers
  )
router
  .route('/users/:userId')
  .get(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    getUser
  )
  .patch(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    updateUser
  )
router
  .route('/users/:userId/reset-password')
  .put(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    resetUserPassword
  )
router.route('/page-access/:pageKey').patch(isAuthenticatedUser, permit([RoleLevels.ADMIN]), patchPageAccessRule)
router
  .route('/password')
  .put(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    changeMemberPassword
  )
router
  .route('/teams')
  .get(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    listTeams
  )
  .post(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), createTeam)
router
  .route('/teams/:teamId')
  .patch(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager]), updateTeam)
  .delete(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), deleteTeam)
router
  .route('/teams/:teamId/assignable-users')
  .get(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager]),
    listAssignableUsers
  )
router
  .route('/teams/:teamId/members')
  .get(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager]),
    listTeamMembers
  )
  .post(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager]),
    addTeamMembers
  )
router
  .route('/teams/:teamId/members/:userId')
  .delete(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager]),
    removeTeamMember
  )

module.exports = router
