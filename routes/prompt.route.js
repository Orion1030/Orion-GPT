const express = require('express')
const {
  getPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
} = require('../controllers/prompt.controller')
require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')

const router = express.Router()

router.route('/').get(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), getPrompts)
router.route('/').post(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), createPrompt)
router.route('/:promptId').get(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), getPromptById)
router.route('/:promptId').put(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), updatePrompt)
router.route('/:promptId').delete(isAuthenticatedUser, permit([RoleLevels.SUPER_ADMIN]), deletePrompt)

module.exports = router
