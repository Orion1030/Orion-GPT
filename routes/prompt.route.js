const express = require('express')
const {
  getPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  getMySystemPrompt,
  getMyEffectiveSystemPrompt,
  upsertMySystemPrompt,
  deleteMySystemPrompt,
  rollbackMySystemPrompt,
  getMySystemPromptAudit,
} = require('../controllers/prompt.controller')
require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')

const router = express.Router()

const userPromptAccess = [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]

router
  .route('/me/system/effective')
  .get(isAuthenticatedUser, permit(userPromptAccess), getMyEffectiveSystemPrompt)
router
  .route('/me/system/rollback')
  .post(isAuthenticatedUser, permit(userPromptAccess), rollbackMySystemPrompt)
router
  .route('/me/system')
  .get(isAuthenticatedUser, permit(userPromptAccess), getMySystemPrompt)
  .put(isAuthenticatedUser, permit(userPromptAccess), upsertMySystemPrompt)
  .delete(isAuthenticatedUser, permit(userPromptAccess), deleteMySystemPrompt)
router
  .route('/me/system/audit')
  .get(isAuthenticatedUser, permit(userPromptAccess), getMySystemPromptAudit)

router.route('/').get(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), getPrompts)
router.route('/').post(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), createPrompt)
router.route('/:promptId').get(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), getPromptById)
router.route('/:promptId').put(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), updatePrompt)
router.route('/:promptId').delete(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), deletePrompt)

module.exports = router
