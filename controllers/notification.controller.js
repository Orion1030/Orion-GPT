const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { NotificationModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')

function toNotificationDto(notification) {
  if (!notification) return null
  return {
    id: String(notification._id),
    userId: String(notification.userId),
    type: notification.type || '',
    title: notification.title || '',
    message: notification.message || '',
    link: notification.link || '',
    level: notification.level || 'info',
    readAt: notification.readAt || null,
    createdAt: notification.createdAt || null,
    updatedAt: notification.updatedAt || null,
    metadata: notification.metadata || {},
  }
}

exports.listNotifications = asyncErrorHandler(async (req, res) => {
  const { user } = req
  if (!user?._id) {
    return sendJsonResult(res, false, null, 'User not found', 401)
  }

  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10))
  const page = Math.max(1, Number(req.query.page) || 1)
  const unreadOnly =
    String(req.query.unread || '').toLowerCase() === 'true' ||
    String(req.query.unreadOnly || '').toLowerCase() === 'true'

  const filter = { userId: user._id }
  if (unreadOnly) {
    filter.readAt = null
  }

  const [items, total] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NotificationModel.countDocuments(filter),
  ])

  return sendJsonResult(res, true, {
    items: items.map(toNotificationDto),
    total,
    page,
    pageSize: limit,
  })
})

exports.markNotificationRead = asyncErrorHandler(async (req, res) => {
  const { user } = req
  const { id } = req.params
  if (!user?._id) {
    return sendJsonResult(res, false, null, 'User not found', 401)
  }

  const notification = await NotificationModel.findOneAndUpdate(
    { _id: id, userId: user._id },
    { $set: { readAt: new Date() } },
    { returnDocument: 'after' }
  ).lean()

  if (!notification) {
    return sendJsonResult(res, false, null, 'Notification not found', 404)
  }

  return sendJsonResult(res, true, toNotificationDto(notification))
})

exports.markAllNotificationsRead = asyncErrorHandler(async (req, res) => {
  const { user } = req
  if (!user?._id) {
    return sendJsonResult(res, false, null, 'User not found', 401)
  }

  const readAt = new Date()
  await NotificationModel.updateMany(
    { userId: user._id, readAt: null },
    { $set: { readAt } }
  )

  return sendJsonResult(res, true, { readAt })
})

module.exports.toNotificationDto = toNotificationDto
