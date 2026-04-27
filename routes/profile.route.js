const express = require('express')

require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { requirePageAccess } = require('../middlewares/pageAccess.middleware')
const { RoleLevels } = require('../utils/constants')
const { PAGE_ACCESS_KEYS } = require('../utils/pageAccess')
const { getProfiles, createProfile, getProfile, updateProfile, deleteProfile } = require('../controllers/profile.controller')

const router = express.Router()

const auth = [
  isAuthenticatedUser,
  permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]),
  requirePageAccess(PAGE_ACCESS_KEYS.PROFILES),
]

router.route('/').get(...auth, getProfiles)
router.route('/:profileId').get(...auth, getProfile)
router.route('/').post(...auth, createProfile)
router.route('/:profileId').put(...auth, updateProfile)
router.route('/:profileId').delete(...auth, deleteProfile)

module.exports = router
