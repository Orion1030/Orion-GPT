require('dotenv').config()
const express = require('express')
const {
  signin,
  signup,
  forgotPassword,
  resetPassword,
  acceptInvitation,
} = require('../controllers/auth.controller')
const router = express.Router()

router.route('/signin').post(signin)
router.route('/signup').post(signup)
router.route('/forgot-password').post(forgotPassword)
router.route('/reset-password').put(resetPassword)
router.route('/invite/accept').put(acceptInvitation)

module.exports = router
