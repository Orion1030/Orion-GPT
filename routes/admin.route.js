const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const {
  changeMemberPassword,
  createGuest,
  deleteGuest,
  getUser,
  getUsageMetrics,
  getUsageMetricsForUser,
  listUsers,
  resetUserPassword,
  updateUser,
} = require('../controllers/admin.controller')
const {
  getMyAiConfiguration,
  upsertMyAiConfiguration,
} = require('../controllers/adminConfiguration.controller')
const { patchPageAccessRule } = require('../controllers/pageAccess.controller')
const {
  addTeamMembers,
  createTeamGuest,
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
  .route('/guests')
  .post(
    isAuthenticatedUser,
    permit([RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    createGuest
  )
router
  .route('/guests/:guestId')
  .delete(
    isAuthenticatedUser,
    permit([RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    deleteGuest
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
  .route('/teams/:teamId/guests')
  .post(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    createTeamGuest
  )
router
  .route('/teams/:teamId/members/:userId')
  .delete(
    isAuthenticatedUser,
    permit([RoleLevels.ADMIN, RoleLevels.Manager]),
    removeTeamMember
  )
router
  .route('/configuration/ai')
  .get(
    isAuthenticatedUser,
    permit([RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager]),
    getMyAiConfiguration
  )
  .put(
    isAuthenticatedUser,
    permit([RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager]),
    upsertMyAiConfiguration
  )

module.exports = router
