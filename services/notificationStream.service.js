const { NotificationModel } = require('../dbModels')
const { emitToUserRoom } = require('../realtime/socketServer')
const { toNotificationDto } = require('../controllers/notification.controller')

let changeStream = null

function startNotificationChangeStream() {
  if (changeStream) return changeStream
  if (typeof NotificationModel.watch !== 'function') return null

  try {
    changeStream = NotificationModel.watch(
      [{ $match: { operationType: 'insert' } }],
      { fullDocument: 'updateLookup' }
    )

    changeStream.on('change', async (event) => {
      const doc = event?.fullDocument
      if (!doc?.toUserId) return
      let payload = toNotificationDto(doc)
      if (!payload?.fromUserName && doc.fromUserId) {
        try {
          const hydrated = await NotificationModel.findById(doc._id)
            .populate('fromUserId', 'name')
            .lean()
          if (hydrated) {
            payload = toNotificationDto(hydrated)
          }
        } catch {
          // ignore lookup failures; fallback to base payload
        }
      }
      emitToUserRoom(String(doc.toUserId), 'notifications:new', payload)
    })

    changeStream.on('error', (error) => {
      console.warn('[notifications] Change stream error', error?.message || error)
    })

    changeStream.on('end', () => {
      changeStream = null
    })
  } catch (error) {
    console.warn('[notifications] Change stream not started', error?.message || error)
  }

  return changeStream
}

function stopNotificationChangeStream() {
  if (!changeStream) return
  try {
    changeStream.close()
  } catch {
    // ignore
  } finally {
    changeStream = null
  }
}

module.exports = {
  startNotificationChangeStream,
  stopNotificationChangeStream,
}
