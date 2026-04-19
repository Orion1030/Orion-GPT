#!/usr/bin/env node
/**
 * Migration: seed hard-coded LLM prompts into MongoDB from .env connection.
 *
 * Usage:
 *   node scripts/migrations/migrate-hardcoded-prompts-to-db.js --dry-run
 *   node scripts/migrations/migrate-hardcoded-prompts-to-db.js --commit
 *   node scripts/migrations/migrate-hardcoded-prompts-to-db.js --commit --ownerUserId=<mongoObjectId>
 *   node scripts/migrations/migrate-hardcoded-prompts-to-db.js --commit --ownerEmail=superadmin@company.com
 */
const path = require('path')
const mongoose = require('mongoose')
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') })

const { RoleLevels } = require('../../utils/constants')
const {
  buildResumeGenerationSystemPrompt,
  buildResumeGenerationUserPromptTemplate,
} = require('../../services/llm/prompts/resumeGenerate.prompts')

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DB_URI ||
  'mongodb://localhost:27017/jobsy'

const argv = process.argv.slice(2)
const commit = argv.includes('--commit')
const dryRun = !commit || argv.includes('--dry-run')
const ownerUserIdArg = argv.find((arg) => arg.startsWith('--ownerUserId='))?.split('=')[1]
const ownerEmailArg = argv.find((arg) => arg.startsWith('--ownerEmail='))?.split('=')[1]

const PROMPT_SEEDS = [
  {
    promptName: 'resume_generation',
    type: 'system',
    context: buildResumeGenerationSystemPrompt(),
  },
  {
    promptName: 'resume_generation',
    type: 'user',
    context: buildResumeGenerationUserPromptTemplate(),
  },
]

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

async function resolveOwnerUserId(usersCollection) {
  const ownerUserId = toObjectId(ownerUserIdArg || process.env.PROMPTS_OWNER_USER_ID)
  if (ownerUserId) {
    const byId = await usersCollection.findOne({ _id: ownerUserId }, { projection: { _id: 1, email: 1, role: 1 } })
    if (!byId) {
      throw new Error(`owner user was not found by id: ${ownerUserId.toString()}`)
    }
    return byId._id
  }

  const ownerEmail = String(ownerEmailArg || process.env.PROMPTS_OWNER_EMAIL || '')
    .trim()
    .toLowerCase()
  if (ownerEmail) {
    const byEmail = await usersCollection.findOne({ email: ownerEmail }, { projection: { _id: 1, email: 1, role: 1 } })
    if (!byEmail) {
      throw new Error(`owner user was not found by email: ${ownerEmail}`)
    }
    return byEmail._id
  }

  const superAdmin = await usersCollection.findOne(
    { role: Number(RoleLevels.SUPER_ADMIN) },
    { sort: { createdAt: 1 }, projection: { _id: 1, email: 1, role: 1 } }
  )
  if (superAdmin?._id) return superAdmin._id

  const admin = await usersCollection.findOne(
    { role: Number(RoleLevels.ADMIN) },
    { sort: { createdAt: 1 }, projection: { _id: 1, email: 1, role: 1 } }
  )
  if (admin?._id) return admin._id

  throw new Error(
    'Could not resolve owner user. Add a super-admin/admin user first, or pass --ownerUserId / --ownerEmail.'
  )
}

async function upsertPrompt(promptsCollection, prompt, ownerUserId) {
  const now = new Date()
  const query = {
    promptName: prompt.promptName,
    type: prompt.type,
    owner: ownerUserId,
  }
  const update = {
    $set: {
      promptName: prompt.promptName,
      type: prompt.type,
      context: String(prompt.context || '').trim(),
      owner: ownerUserId,
      updatedBy: ownerUserId,
      updatedAt: now,
    },
    $setOnInsert: {
      createdAt: now,
    },
  }

  const existing = await promptsCollection.findOne(query, { projection: { _id: 1, updatedAt: 1 } })
  if (dryRun) {
    return {
      matched: Boolean(existing),
      upserted: !existing,
      modified: Boolean(existing),
    }
  }

  const result = await promptsCollection.updateOne(query, update, { upsert: true })
  return {
    matched: result.matchedCount > 0,
    upserted: result.upsertedCount > 0,
    modified: result.modifiedCount > 0,
  }
}

async function main() {
  console.log(
    `[migrate-hardcoded-prompts-to-db] connect=${redactMongoUri(MONGO_URI)} mode=${dryRun ? 'dry-run' : 'commit'}`
  )
  await mongoose.connect(MONGO_URI)

  const usersCollection = mongoose.connection.db.collection('users')
  const promptsCollection = mongoose.connection.db.collection('prompts')
  const ownerUserId = await resolveOwnerUserId(usersCollection)

  let inserted = 0
  let updated = 0

  for (const prompt of PROMPT_SEEDS) {
    const result = await upsertPrompt(promptsCollection, prompt, ownerUserId)
    if (result.upserted) inserted += 1
    if (result.matched || result.modified) updated += 1

    const action = result.upserted ? 'upsert-insert' : 'upsert-update'
    console.log(
      `[migrate-hardcoded-prompts-to-db] ${action} promptName=${prompt.promptName} type=${prompt.type} owner=${ownerUserId.toString()}`
    )
  }

  console.log(
    `[migrate-hardcoded-prompts-to-db] done total=${PROMPT_SEEDS.length} inserted=${inserted} updated=${updated}`
  )
  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error('[migrate-hardcoded-prompts-to-db] failed', error)
  try {
    await mongoose.disconnect()
  } catch {
    // ignore disconnect errors
  }
  process.exit(1)
})
