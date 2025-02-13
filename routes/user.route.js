const express = require('express')
const { changePassword } = require('../controllers/user.controller')
require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')

const router = express.Router()
router.route('/password').put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.USER]), changePassword)

module.exports = router
