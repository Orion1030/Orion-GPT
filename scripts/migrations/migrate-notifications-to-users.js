#!/usr/bin/env node
/**
 * Migration: backfill Notification.toUserId/fromUserId and remove legacy userId.
 *
 * Usage:
 *   node scripts/migrations/migrate-notifications-to-users.js --dry-run
 *   node scripts/migrations/migrate-notifications-to-users.js --commit
 *   node scripts/migrations/migrate-notifications-to-users.js --commit --limit=100
 */
const mongoose = require('mongoose')
require('dotenv').config()

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DB_URI ||
  'mongodb://localhost:27017/jobsy'

const argv = process.argv.slice(2)
const commit = argv.includes('--commit')
const dryRun = !commit || argv.includes('--dry-run')
const limitArg = argv.find((arg) => arg.startsWith('--limit='))
const sampleArg = argv.find((arg) => arg.startsWith('--sample='))
const limit = limitArg ? Math.max(0, Number(limitArg.split('=')[1]) || 0) : 0
const sampleLimit = sampleArg ? Math.max(0, Number(sampleArg.split('=')[1]) || 0) : 20

function redactMongoUri(uri) {
  try {
    const parsed = new URL(uri)
    if (parsed.username || parsed.password) {
      parsed.username = '****'
      parsed.password = '****'
    }
    return parsed.toString()
  } catch {
    return '[redacted-uri]'
  }
}

function toObjectId(value) {
  if (!value) return null
  if (value instanceof mongoose.Types.ObjectId) return value
  const raw = String(value || '').trim()
  if (!mongoose.Types.ObjectId.isValid(raw)) return null
  return new mongoose.Types.ObjectId(raw)
}

async function main() {
  console.log(
    `[migrate-notifications-to-users] connect=${redactMongoUri(MONGO)} mode=${dryRun ? 'dry-run' : 'commit'} limit=${limit || 'none'}`
  )

  await mongoose.connect(MONGO)

  const filter = {
    $or: [
      { toUserId: { $exists: false } },
      { toUserId: null },
      { userId: { $exists: true } },
    ],
  }

  const collection = mongoose.connection.db.collection('notifications')
  let cursor = collection.find(filter).sort({ createdAt: 1 })
  if (limit > 0) {
    cursor = cursor.limit(limit)
  }

  let scanned = 0
  let updated = 0
  let toUserIdBackfilled = 0
  let fromUserIdBackfilled = 0
  let legacyCleared = 0
  let noChange = 0
  const sampleIds = []

  for await (const doc of cursor) {
    scanned += 1
    const sets = {}
    const unsets = {}

    if (!doc.toUserId && doc.userId) {
      sets.toUserId = doc.userId
      toUserIdBackfilled += 1
    }

    if (!doc.fromUserId) {
      const candidate =
        doc?.metadata?.fromUserId ||
        doc?.metadata?.userId ||
        doc?.metadata?.actorUserId ||
        null
      const parsed = toObjectId(candidate)
      if (parsed) {
        sets.fromUserId = parsed
        fromUserIdBackfilled += 1
      }
    }

    if (doc.userId) {
      unsets.userId = 1
      legacyCleared += 1
    }

    const hasUpdate = Object.keys(sets).length > 0 || Object.keys(unsets).length > 0
    if (!hasUpdate) {
      noChange += 1
      continue
    }

    if (sampleIds.length < sampleLimit) {
      sampleIds.push(String(doc._id))
    }

    if (!dryRun) {
      const updatePayload = {}
      if (Object.keys(sets).length > 0) updatePayload.$set = sets
      if (Object.keys(unsets).length > 0) updatePayload.$unset = unsets
      await collection.updateOne({ _id: doc._id }, updatePayload)
    }
    updated += 1
  }

  console.log(
    `[migrate-notifications-to-users] scanned=${scanned} updated=${updated} toUserIdBackfilled=${toUserIdBackfilled} fromUserIdBackfilled=${fromUserIdBackfilled} legacyCleared=${legacyCleared} noChange=${noChange}`
  )
  if (sampleIds.length > 0) {
    console.log(`[migrate-notifications-to-users] sampleIds=${sampleIds.join(',')}`)
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('[migrate-notifications-to-users] failed', err)
  process.exit(1)
})
