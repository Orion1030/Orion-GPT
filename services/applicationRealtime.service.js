const crypto = require('crypto')
const {
  emitToUserRoom,
} = require('../realtime/socketServer')

const connectionsByApplicationId = new Map()

function getBucket(applicationId) {
  const key = String(applicationId)
  let bucket = connectionsByApplicationId.get(key)
  if (!bucket) {
    bucket = new Set()
    connectionsByApplicationId.set(key, bucket)
  }
  return bucket
}

function subscribeApplicationEvents(applicationId, res) {
  const bucket = getBucket(applicationId)
  bucket.add(res)

  return () => {
    const key = String(applicationId)
    const currentBucket = connectionsByApplicationId.get(key)
    if (!currentBucket) return
    currentBucket.delete(res)
    if (!currentBucket.size) {
      connectionsByApplicationId.delete(key)
    }
  }
}

function writeSseEnvelope(res, envelope) {
  try {
    res.write(`data: ${JSON.stringify(envelope)}\n\n`)
  } catch {
    // Ignore transport-level errors; requester will reconnect.
  }
}

function publishApplicationEvent(applicationId, envelope, options = {}) {
  const bucket = connectionsByApplicationId.get(String(applicationId))
  if (bucket && bucket.size) {
    for (const res of bucket.values()) {
      writeSseEnvelope(res, envelope)
    }
  }

  const userId = options.userId || envelope?.userId || envelope?.data?.userId
  if (userId) {
    emitToUserRoom(userId, 'applications:event', envelope)
    if (envelope?.type && typeof envelope.type === 'string') {
      emitToUserRoom(userId, envelope.type, envelope)
    }
  }
}

function buildApplicationEventEnvelope({ type, applicationId, version, data }) {
  return {
    eventId: crypto.randomUUID(),
    type,
    applicationId: String(applicationId),
    version: Number(version || 1),
    timestamp: new Date().toISOString(),
    data: data || {},
  }
}

module.exports = {
  subscribeApplicationEvents,
  publishApplicationEvent,
  buildApplicationEventEnvelope,
}
