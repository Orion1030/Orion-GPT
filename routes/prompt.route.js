const express = require('express')
const { getPrompts, createNewPrompt, updatePrompt, deletePrompt } = require('../controllers/prompt.controller')
require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')

const router = express.Router()
router.route('/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.USER]), getPrompts)
router.route('/create').post(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.USER]), createNewPrompt)
router.route('/update/:promptId').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.USER]), updatePrompt)
router.route('/delete').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.USER]), deletePrompt)

module.exports = router
