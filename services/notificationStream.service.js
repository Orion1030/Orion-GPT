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

    changeStream.on('change', (event) => {
      const doc = event?.fullDocument
      if (!doc?.userId) return
      emitToUserRoom(String(doc.userId), 'notifications:new', toNotificationDto(doc))
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
