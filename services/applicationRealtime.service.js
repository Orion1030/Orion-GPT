const crypto = require('crypto')

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

function publishApplicationEvent(applicationId, envelope) {
  const bucket = connectionsByApplicationId.get(String(applicationId))
  if (!bucket || !bucket.size) return
  for (const res of bucket.values()) {
    writeSseEnvelope(res, envelope)
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

