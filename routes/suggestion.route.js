const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const { changeMemberPassword } = require('../controllers/admin.controller')

const router = express.Router()
router.route('/password').put(isAuthenticatedUser, permit([RoleLevels.ADMIN]), changeMemberPassword)

module.exports = router
