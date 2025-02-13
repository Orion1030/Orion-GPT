require('dotenv').config()
const express = require('express')
const {
  signin,
  signup,
  forgotPassword,
  resetPassword,
  verifyOtp,
  acceptInvitation,
} = require('../controllers/auth.controller')
const router = express.Router()

router.route('/auth/signin').post(signin)
router.route('/auth/signup').post(signup)
router.route('/password/forgot').post(forgotPassword)
router.route('/password/reset').put(resetPassword)
router.route('/auth/invite/accept').put(acceptInvitation)

module.exports = router
