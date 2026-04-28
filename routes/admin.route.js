const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const {
  changeMemberPassword,
  createGuest,
  deleteGuest,
  deleteUser,
  getGuestProfileAssignments,
  getUser,
  getUsageMetrics,
  getUsageMetricsForUser,
  listUsers,
  resetUserPassword,
  updateUser,
  updateGuestProfileAssignments,
} = require('../controllers/admin.controller')
const {
  getAiProviderCatalog,
  getMyAiConfiguration,
  upsertAiProviderCatalog,
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
  .delete(
    isAuthenticatedUser,
    permit([RoleLevels.SUPER_ADMIN]),
    deleteUser
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
  .route('/guests/:guestId/profiles')
  .get(
    isAuthenticatedUser,
    permit([RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    getGuestProfileAssignments
  )
  .put(
    isAuthenticatedUser,
    permit([RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]),
    updateGuestProfileAssignments
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
router
  .route('/configuration/ai-catalog')
  .get(
    isAuthenticatedUser,
    permit([RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager]),
    getAiProviderCatalog
  )
router
  .route('/configuration/ai-catalog/:providerKey')
  .put(
    isAuthenticatedUser,
    permit([RoleLevels.SUPER_ADMIN]),
    upsertAiProviderCatalog
  )

module.exports = router
