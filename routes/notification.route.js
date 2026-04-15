const express = require('express')
const { isAuthenticatedUser } = require('../middlewares/auth.middleware')
const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../controllers/notification.controller')

const router = express.Router()

router.route('/').get(isAuthenticatedUser, listNotifications)
router.route('/read-all').post(isAuthenticatedUser, markAllNotificationsRead)
router.route('/:id/read').post(isAuthenticatedUser, markNotificationRead)

module.exports = router
