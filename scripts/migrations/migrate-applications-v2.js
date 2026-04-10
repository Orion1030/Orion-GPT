#!/usr/bin/env node
/**
 * Migration script for Applications v2 contract.
 *
 * Usage:
 *   node scripts/migrations/migrate-applications-v2.js --dry-run
 *   node scripts/migrations/migrate-applications-v2.js --commit
 *   node scripts/migrations/migrate-applications-v2.js --commit --limit=100
 *   node scripts/migrations/migrate-applications-v2.js --commit --user-id=<mongodb-object-id>
 */
const mongoose = require('mongoose')
require('dotenv').config()

const ApplicationModel = require('../../dbModels/Application.Model')
const ApplicationEventModel = require('../../dbModels/ApplicationEvent.Model')
const ResumeModel = require('../../dbModels/Resume.Model')
const ProfileModel = require('../../dbModels/Profile.Model')
const {
  normalizeApplyConfig,
  toCanonicalApplicationStatus,
  toCanonicalGenerationStatus,
  toLegacyStatus,
} = require('../../services/applicationContract')

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DB_URI ||
  'mongodb://localhost:27017/jobsy'

const argv = process.argv.slice(2)
const commit = argv.includes('--commit')
const dryRun = !commit || argv.includes('--dry-run')
const limitArg = argv.find((arg) => arg.startsWith('--limit='))
const userIdArg = argv.find((arg) => arg.startsWith('--user-id='))
const sampleArg = argv.find((arg) => arg.startsWith('--sample='))
const limit = limitArg ? Math.max(0, Number(limitArg.split('=')[1]) || 0) : 0
const sampleLimit = sampleArg ? Math.max(0, Number(sampleArg.split('=')[1]) || 0) : 20

function parseUserIdArg(value) {
  if (!value) return null
  const raw = String(value.split('=')[1] || '').trim()
  if (!raw) return null
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new Error(`Invalid --user-id value: ${raw}`)
  }
  return new mongoose.Types.ObjectId(raw)
}

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

function stableStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function buildCreatedPayload(appDoc, applyConfig, canonicalStatus, canonicalGenerationStatus) {
  return {
    applicationStatus: canonicalStatus,
    generationStatus: canonicalGenerationStatus,
    applyConfig: {
      resumeReferenceMode: applyConfig.resumeReferenceMode,
      profileSelectionMode: applyConfig.profileSelectionMode,
      manualProfileId: applyConfig.manualProfileId || null,
      manualResumeId: applyConfig.manualResumeId || null,
    },
    snapshot: {
      companyName: appDoc.companyName || '',
      jobTitle: appDoc.jobTitle || '',
      resumeName: appDoc.resumeName || '',
      profileNameSnapshot: appDoc.profileNameSnapshot || '',
    },
  }
}

async function readLatestEventSequence(applicationId) {
  const latest = await ApplicationEventModel.findOne({ applicationId })
    .sort({ 'meta.sequence': -1, createdAt: -1 })
    .select('meta.sequence')
    .lean()
  return Number(latest?.meta?.sequence || 0)
}

async function upsertMigrationEvent({
  applicationId,
  userId,
  requestId,
  eventType,
  payload,
  sequence,
  createdAt,
  dryRunOnly,
}) {
  if (dryRunOnly) {
    const existing = await ApplicationEventModel.findOne({
      applicationId,
      'meta.requestId': requestId,
    })
      .select('_id')
      .lean()
    return { inserted: !existing, sequence }
  }

  const result = await ApplicationEventModel.updateOne(
    {
      applicationId,
      'meta.requestId': requestId,
    },
    {
      $setOnInsert: {
        userId,
        applicationId,
        eventType,
        actorType: 'system',
        actorId: null,
        payload: payload || {},
        meta: {
          requestId,
          source: 'migration_v2',
          eventVersion: 1,
          sequence,
        },
        createdAt: createdAt || new Date(),
      },
    },
    { upsert: true }
  )

  return { inserted: Boolean(result?.upsertedCount), sequence }
}

async function main() {
  const userIdFilter = parseUserIdArg(userIdArg)

  console.log(
    `[migrate-applications-v2] connect=${redactMongoUri(MONGO)} mode=${dryRun ? 'dry-run' : 'commit'} limit=${limit || 'none'} userId=${userIdFilter || 'all'}`
  )

  await mongoose.connect(MONGO)

  const filter = {}
  if (userIdFilter) filter.userId = userIdFilter
  let cursor = ApplicationModel.find(filter).sort({ createdAt: 1 }).cursor()
  if (limit > 0) {
    cursor = ApplicationModel.find(filter).sort({ createdAt: 1 }).limit(limit).cursor()
  }

  let scanned = 0
  let updated = 0
  let createdEventsInserted = 0
  let statusEventsInserted = 0
  let resumeNameBackfilled = 0
  let profileNameBackfilled = 0
  let noChange = 0
  const sampleIds = []

  for await (const appDoc of cursor) {
    scanned += 1
    const appId = appDoc._id
    const updates = {}
    let docTouched = false

    const canonicalStatus = toCanonicalApplicationStatus(appDoc.applicationStatus || appDoc.status)
    if (appDoc.applicationStatus !== canonicalStatus) {
      updates.applicationStatus = canonicalStatus
      docTouched = true
    }

    const canonicalGenerationStatus = toCanonicalGenerationStatus(appDoc.generationStatus)
    if (appDoc.generationStatus !== canonicalGenerationStatus) {
      updates.generationStatus = canonicalGenerationStatus
      docTouched = true
    }

    const normalizedApplyConfig = normalizeApplyConfig(appDoc.applyConfig || {})
    const existingApplyConfig = {
      resumeReferenceMode: appDoc.applyConfig?.resumeReferenceMode || null,
      profileSelectionMode: appDoc.applyConfig?.profileSelectionMode || null,
      manualProfileId: appDoc.applyConfig?.manualProfileId ? String(appDoc.applyConfig.manualProfileId) : null,
      manualResumeId: appDoc.applyConfig?.manualResumeId ? String(appDoc.applyConfig.manualResumeId) : null,
    }
    if (stableStringify(normalizedApplyConfig) !== stableStringify(existingApplyConfig)) {
      updates.applyConfig = normalizedApplyConfig
      docTouched = true
    }

    if ((!appDoc.resumeName || !String(appDoc.resumeName).trim()) && appDoc.resumeId) {
      const resume = await ResumeModel.findById(appDoc.resumeId).select('name').lean()
      if (resume?.name) {
        updates.resumeName = String(resume.name).trim()
        docTouched = true
        resumeNameBackfilled += 1
      }
    }

    if ((!appDoc.profileNameSnapshot || !String(appDoc.profileNameSnapshot).trim()) && appDoc.profileId) {
      const profile = await ProfileModel.findById(appDoc.profileId).select('fullName').lean()
      if (profile?.fullName) {
        updates.profileNameSnapshot = String(profile.fullName).trim()
        docTouched = true
        profileNameBackfilled += 1
      }
    }

    if (!Number.isFinite(Number(appDoc.version)) || Number(appDoc.version) < 1) {
      updates.version = 1
      docTouched = true
    }

    if (!appDoc.lastActivityAt) {
      updates.lastActivityAt = appDoc.updatedAt || appDoc.createdAt || new Date()
      docTouched = true
    }

    if (!appDoc.status || String(appDoc.status).trim() === '') {
      updates.status = toLegacyStatus(canonicalStatus)
      docTouched = true
    }

    let sequenceCursor = Math.max(
      Number(appDoc.historySequence || 0),
      await readLatestEventSequence(appId)
    )

    const createdRequestId = `migration-v2-created-${String(appId)}`
    const snapshotDoc = {
      ...appDoc.toObject(),
      ...updates,
    }
    const createdPayload = buildCreatedPayload(snapshotDoc, normalizedApplyConfig, canonicalStatus, canonicalGenerationStatus)
    const createdInsert = await upsertMigrationEvent({
      applicationId: appId,
      userId: appDoc.userId,
      requestId: createdRequestId,
      eventType: 'created',
      payload: createdPayload,
      sequence: sequenceCursor + 1,
      createdAt: appDoc.createdAt || new Date(),
      dryRunOnly: dryRun,
    })
    if (createdInsert.inserted) {
      sequenceCursor += 1
      createdEventsInserted += 1
    }

    // Migration baseline rule: write a status event only for non-default mapped states.
    if (canonicalStatus !== 'in_progress') {
      const statusRequestId = `migration-v2-status-${String(appId)}`
      const statusInsert = await upsertMigrationEvent({
        applicationId: appId,
        userId: appDoc.userId,
        requestId: statusRequestId,
        eventType: 'status_updated',
        payload: {
          field: 'applicationStatus',
          oldValue: 'in_progress',
          newValue: canonicalStatus,
        },
        sequence: sequenceCursor + 1,
        createdAt: appDoc.updatedAt || appDoc.createdAt || new Date(),
        dryRunOnly: dryRun,
      })
      if (statusInsert.inserted) {
        sequenceCursor += 1
        statusEventsInserted += 1
      }
    }

    if (Number(appDoc.historySequence || 0) !== sequenceCursor) {
      updates.historySequence = sequenceCursor
      docTouched = true
    }

    if (docTouched) {
      if (!dryRun) {
        await ApplicationModel.updateOne({ _id: appId }, { $set: updates })
      }
      updated += 1
      if (sampleIds.length < sampleLimit) sampleIds.push(String(appId))
    } else {
      noChange += 1
    }
  }

  console.log('[migrate-applications-v2] summary')
  console.log(`  scanned: ${scanned}`)
  console.log(`  updated: ${updated}`)
  console.log(`  noChange: ${noChange}`)
  console.log(`  createdEventsInserted: ${createdEventsInserted}`)
  console.log(`  statusEventsInserted: ${statusEventsInserted}`)
  console.log(`  resumeNameBackfilled: ${resumeNameBackfilled}`)
  console.log(`  profileNameBackfilled: ${profileNameBackfilled}`)
  if (sampleIds.length) {
    console.log(`  sampleApplicationIds: ${sampleIds.join(', ')}`)
  }

  await mongoose.disconnect()
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('[migrate-applications-v2] error:', error?.message || error)
    try {
      await mongoose.disconnect()
    } catch {
      // ignore cleanup errors
    }
    process.exit(2)
  })
