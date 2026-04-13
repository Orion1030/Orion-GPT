const express = require('express')
require('dotenv').config()

const { isAuthenticatedUser, permit } = require('../middlewares/auth.middleware')
const { RoleLevels } = require('../utils/constants')
const { validate } = require('../middlewares/validate')
const {
  applyRules,
  listRules,
  patchRules,
  historyQueryRules,
} = require('../validators/application.validator')
const {
  applyForApplication,
  listApplications,
  getApplicationDetail,
  patchApplication,
  getApplicationHistory,
  resolveApplicationChat,
  streamApplicationEvents,
  deleteApplication,
  getApplicationsByProfileId,
} = require('../controllers/application.controller')

const router = express.Router()
const auth = [isAuthenticatedUser, permit([RoleLevels.ADMIN, RoleLevels.User, RoleLevels.Manager])]

router.route('/')
  .get(...auth, listRules, validate, listApplications)

router.route('/apply')
  .post(...auth, applyRules, validate, applyForApplication)

router.route('/profile/:profileId')
  .get(...auth, getApplicationsByProfileId)

router.route('/:applicationId/history')
  .get(...auth, historyQueryRules, validate, getApplicationHistory)

router.route('/:applicationId/chat/resolve')
  .post(...auth, resolveApplicationChat)

router.route('/:applicationId/events')
  .get(...auth, streamApplicationEvents)

router.route('/:applicationId')
  .get(...auth, getApplicationDetail)
  .patch(...auth, patchRules, validate, patchApplication)
  .put(...auth, patchRules, validate, patchApplication)
  .delete(...auth, deleteApplication)

module.exports = router
