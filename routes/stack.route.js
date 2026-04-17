const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const { getStacks, createStack, getStackById, updateStack, getStackBytitle, getStacksByPrimarySkills, deleteStack, clearStacks } = require('../controllers/stack.controller')
const router = express.Router()
router.route('/').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getStacks)
router.route('/').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), clearStacks)
router.route('/').post(isAuthenticatedUser, permit([RoleLevels.ADMIN]), createStack) 
router.route('/by-title').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getStackBytitle)
router.route('/primarySkills').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getStacksByPrimarySkills)
router.route('/:stackId').get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getStackById)
router.route('/:stackId').put(isAuthenticatedUser, permit([RoleLevels.ADMIN]), updateStack)
router.route('/:stackId').delete(isAuthenticatedUser, permit([RoleLevels.ADMIN]), deleteStack)


module.exports = router
