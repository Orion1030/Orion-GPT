const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { NotificationModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')

function toNotificationDto(notification) {
  if (!notification) return null
  const fromUserRef = notification.fromUserId
  const resolvedFromUserId = fromUserRef
    ? typeof fromUserRef === 'object' && fromUserRef._id
      ? String(fromUserRef._id)
      : String(fromUserRef)
    : ''
  const resolvedFromUserName =
    fromUserRef && typeof fromUserRef === 'object' && typeof fromUserRef.name === 'string'
      ? fromUserRef.name
      : ''
  return {
    id: String(notification._id),
    toUserId: notification.toUserId ? String(notification.toUserId) : '',
    fromUserId: resolvedFromUserId,
    fromUserName: resolvedFromUserName,
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

  const filter = { toUserId: user._id }
  if (unreadOnly) {
    filter.readAt = null
  }

  const [items, total] = await Promise.all([
    NotificationModel.find(filter)
      .populate('fromUserId', 'name')
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
    { _id: id, toUserId: user._id },
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
    { toUserId: user._id, readAt: null },
    { $set: { readAt } }
  )

  return sendJsonResult(res, true, { readAt })
})

module.exports.toNotificationDto = toNotificationDto
