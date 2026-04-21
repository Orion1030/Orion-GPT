const jwt = require('jsonwebtoken')
const { Server } = require('socket.io')
const { ApplicationModel, UserModel, NotificationModel } = require('../dbModels')
const { getJwtSecret } = require('../utils')
const { isAdminUser } = require('../utils/access')
const { toNotificationDto } = require('../controllers/notification.controller')

const SOCKET_PATH = '/realtime/socket.io'
const HEARTBEAT_INTERVAL_MS = 15000

let ioInstance = null

function buildUserRoom(userId) {
  return `user:${String(userId)}`
}

function buildApplicationRoom(applicationId) {
  return `application:${String(applicationId)}`
}

function extractTokenFromHandshake(handshake) {
  const authToken =
    handshake?.auth && typeof handshake.auth.token === 'string'
      ? handshake.auth.token.trim()
      : ''
  if (authToken) return authToken

  const queryToken =
    handshake?.query && typeof handshake.query.token === 'string'
      ? handshake.query.token.trim()
      : ''
  if (queryToken) return queryToken

  const headerValue =
    handshake?.headers && typeof handshake.headers.authorization === 'string'
      ? handshake.headers.authorization.trim()
      : ''
  if (headerValue.toLowerCase().startsWith('bearer ')) {
    return headerValue.slice(7).trim()
  }
  return ''
}

async function verifySocketIdentity(socket, next) {
  const token = extractTokenFromHandshake(socket.handshake)
  if (!token) {
    return next(new Error('unauthorized'))
  }

  let decoded
  try {
    decoded = jwt.verify(token, getJwtSecret())
  } catch {
    return next(new Error('unauthorized'))
  }

  const user = await UserModel.findOne({ _id: decoded.id }).select('_id role').lean()
  if (!user) {
    return next(new Error('unauthorized'))
  }

  socket.data.userId = String(user._id)
  socket.data.role = user.role
  return next()
}

async function joinApplicationRoom(socket, payload) {
  const rawId =
    payload && typeof payload.applicationId === 'string'
      ? payload.applicationId.trim()
      : ''
  if (!rawId) return

  try {
    const scope = { _id: rawId }
    if (!isAdminUser({ role: socket.data.role })) {
      scope.userId = socket.data.userId
    }
    const exists = await ApplicationModel.exists(scope)
    if (!exists) {
      socket.emit('applications:error', {
        code: 'not_found',
        applicationId: rawId,
        message: 'Application not found',
      })
      return
    }
    socket.join(buildApplicationRoom(rawId))
  } catch {
    socket.emit('applications:error', {
      code: 'invalid_application_id',
      applicationId: rawId,
      message: 'Invalid application identifier',
    })
  }
}

function leaveApplicationRoom(socket, payload) {
  const rawId =
    payload && typeof payload.applicationId === 'string'
      ? payload.applicationId.trim()
      : ''
  if (!rawId) return
  socket.leave(buildApplicationRoom(rawId))
}

function emitToRoom(room, eventName, payload) {
  if (!ioInstance) return false
  if (!room || !eventName) return false
  ioInstance.to(room).emit(eventName, payload)
  return true
}

function emitToApplicationRoom(applicationId, eventName, payload) {
  return emitToRoom(buildApplicationRoom(applicationId), eventName, payload)
}

function emitToUserRoom(userId, eventName, payload) {
  return emitToRoom(buildUserRoom(userId), eventName, payload)
}

function initSocketServer(httpServer) {
  if (ioInstance) return ioInstance

  ioInstance = new Server(httpServer, {
    path: SOCKET_PATH,
    cors: {
      origin: true,
      credentials: true,
    },
  })

  ioInstance.use((socket, next) => {
    verifySocketIdentity(socket, next).catch(() => next(new Error('unauthorized')))
  })

  ioInstance.on('connection', (socket) => {
    const userRoom = buildUserRoom(socket.data.userId)
    socket.join(userRoom)
    const heartbeatTimer = setInterval(() => {
      socket.emit('applications:heartbeat', {
        timestamp: new Date().toISOString(),
      })
    }, HEARTBEAT_INTERVAL_MS)

    socket.on('applications:subscribe_list', () => {
      socket.join(userRoom)
    })

    socket.on('applications:subscribe_detail', (payload) => {
      joinApplicationRoom(socket, payload).catch(() => {})
    })

    socket.on('applications:unsubscribe_detail', (payload) => {
      leaveApplicationRoom(socket, payload)
    })

    socket.on('notifications:read', async (payload) => {
      const notificationId =
        payload && typeof payload.notificationId === 'string'
          ? payload.notificationId.trim()
          : ''
      if (!notificationId) return
      try {
        const updated = await NotificationModel.findOneAndUpdate(
          { _id: notificationId, toUserId: socket.data.userId },
          { $set: { readAt: new Date() } },
          { returnDocument: 'after' }
        ).lean()
        if (!updated) return
        emitToUserRoom(socket.data.userId, 'notifications:read', toNotificationDto(updated))
      } catch {
        // ignore
      }
    })

    socket.on('notifications:read_all', async () => {
      try {
        const readAt = new Date()
        await NotificationModel.updateMany(
          { toUserId: socket.data.userId, readAt: null },
          { $set: { readAt } }
        )
        emitToUserRoom(socket.data.userId, 'notifications:read_all', {
          readAt: readAt.toISOString(),
        })
      } catch {
        // ignore
      }
    })

    socket.on('disconnect', () => {
      clearInterval(heartbeatTimer)
    })
  })

  return ioInstance
}

module.exports = {
  SOCKET_PATH,
  initSocketServer,
  buildUserRoom,
  buildApplicationRoom,
  emitToRoom,
  emitToApplicationRoom,
  emitToUserRoom,
}
