const express = require('express')
require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { requirePageAccess } = require('../middlewares/pageAccess.middleware')
const { RoleLevels } = require('../utils/constants')
const { PAGE_ACCESS_KEYS } = require('../utils/pageAccess')
const { getReport } = require('../controllers/reporting.controller')

const router = express.Router()
const accessGuard = requirePageAccess(PAGE_ACCESS_KEYS.REPORTS)

router.get('/', isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]), accessGuard, getReport)

module.exports = router
