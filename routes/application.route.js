const express = require('express')
require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const {
  getAllApplications,
  getApplicationsByProfileId,
  createApplication,
  updateApplication,
  deleteApplication,
} = require('../controllers/application.controller')

const router = express.Router()

router.route('/')
  .get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getAllApplications)
  .post(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), createApplication)

router.route('/profile/:profileId')
  .get(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), getApplicationsByProfileId)

router.route('/:id')
  .put(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), updateApplication)
  .delete(isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User]), deleteApplication)

module.exports = router
