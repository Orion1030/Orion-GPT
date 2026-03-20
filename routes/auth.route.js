require('dotenv').config()
const express = require('express')
const {
  signin,
  signup,
  forgotPassword,
  resetPassword,
  acceptInvitation,
  refresh,
} = require('../controllers/auth.controller')
const { signupRules, signinRules } = require('../validators/auth.validator')
const { validate } = require('../middlewares/validate')
const router = express.Router()

router.route('/signin').post(signinRules, validate, signin)
router.route('/signup').post(signupRules, validate, signup)
router.route('/refresh').post(refresh)
router.route('/forgot-password').post(forgotPassword)
router.route('/reset-password').put(resetPassword)
router.route('/invite/accept').put(acceptInvitation)

module.exports = router
