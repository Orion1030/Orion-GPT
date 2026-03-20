const express = require('express')
require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const { getReport } = require('../controllers/reporting.controller')

const router = express.Router()

router.get('/', isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getReport)

module.exports = router
