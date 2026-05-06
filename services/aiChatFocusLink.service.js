const crypto = require('crypto')
const { AiChatFocusLinkModel } = require('../dbModels')
const { getJwtSecret } = require('../utils')

const DEFAULT_IDLE_TTL_MS = 60 * 60 * 1000
const DEFAULT_ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000
const MIN_TTL_MS = 5 * 60 * 1000
const MAX_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function parsePositiveMs(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getIdleTtlMs() {
  return Math.max(
    MIN_TTL_MS,
    parsePositiveMs(process.env.AI_CHAT_FOCUS_IDLE_TTL_MS, DEFAULT_IDLE_TTL_MS)
  )
}

function getAbsoluteTtlMs() {
  return Math.min(
    MAX_ABSOLUTE_TTL_MS,
    Math.max(
      MIN_TTL_MS,
      parsePositiveMs(process.env.AI_CHAT_FOCUS_ABSOLUTE_TTL_MS, DEFAULT_ABSOLUTE_TTL_MS)
    )
  )
}

function getFocusSecret() {
  const secret =
    process.env.AI_CHAT_FOCUS_LINK_SECRET ||
    process.env.AI_CHAT_EDGE_TOKEN_SECRET ||
    getJwtSecret()
  return String(secret || '').trim()
}

function randomKey(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('base64url')
}

function hashValue(prefix, value) {
  return crypto
    .createHmac('sha256', getFocusSecret())
    .update(`${prefix}:${String(value || '')}`)
    .digest('base64url')
}

function hashRouteKey(routeKey) {
  return hashValue('route', routeKey)
}

function hashToken(token) {
  return hashValue('token', token)
}

function hashPair(routeKey, token) {
  return hashValue('pair', `${routeKey}.${token}`)
}

function sanitizeKey(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || trimmed.length > 256) return ''
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return ''
  return trimmed
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function mapFocusLinkPayload(doc) {
  if (!doc) return null
  return {
    id: String(doc._id),
    sessionId: String(doc.sessionId),
    sessionUserId: String(doc.sessionUserId),
    createdByUserId: String(doc.createdByUserId),
    expiresAt: toDate(doc.expiresAt),
    absoluteExpiresAt: toDate(doc.absoluteExpiresAt),
    lastUsedAt: toDate(doc.lastUsedAt),
    useCount: Number(doc.useCount || 0),
  }
}

async function createFocusLink({
  sessionId,
  sessionUserId,
  createdByUserId,
} = {}) {
  if (!sessionId || !sessionUserId || !createdByUserId) {
    throw new Error('Focus link requires sessionId, sessionUserId, and createdByUserId')
  }

  const routeKey = randomKey()
  const token = randomKey()
  const now = Date.now()
  const idleTtlMs = getIdleTtlMs()
  const absoluteTtlMs = getAbsoluteTtlMs()
  const absoluteExpiresAt = new Date(now + absoluteTtlMs)
  const expiresAt = new Date(Math.min(now + idleTtlMs, absoluteExpiresAt.getTime()))

  const doc = await AiChatFocusLinkModel.create({
    routeKeyHash: hashRouteKey(routeKey),
    tokenHash: hashToken(token),
    pairHash: hashPair(routeKey, token),
    sessionId,
    sessionUserId,
    createdByUserId,
    expiresAt,
    absoluteExpiresAt,
    lastUsedAt: new Date(now),
  })

  return {
    routeKey,
    token,
    path: `/aiChat/focus/${routeKey}/${token}`,
    expiresAt: doc.expiresAt,
    absoluteExpiresAt: doc.absoluteExpiresAt,
  }
}

async function validateFocusLink(routeKeyInput, tokenInput, options = {}) {
  const routeKey = sanitizeKey(routeKeyInput)
  const token = sanitizeKey(tokenInput)
  if (!routeKey || !token) return null

  const nowMs = Date.now()
  const now = new Date(nowMs)
  const doc = await AiChatFocusLinkModel.findOne({
    routeKeyHash: hashRouteKey(routeKey),
    tokenHash: hashToken(token),
    pairHash: hashPair(routeKey, token),
    revokedAt: null,
    expiresAt: { $gt: now },
    absoluteExpiresAt: { $gt: now },
  }).lean()

  if (!doc) return null

  if (options.touch === false) {
    return mapFocusLinkPayload(doc)
  }

  const absoluteExpiresAt = toDate(doc.absoluteExpiresAt)
  if (!absoluteExpiresAt) return null
  const nextExpiresAt = new Date(
    Math.min(nowMs + getIdleTtlMs(), absoluteExpiresAt.getTime())
  )

  await AiChatFocusLinkModel.updateOne(
    { _id: doc._id, revokedAt: null },
    {
      $set: {
        expiresAt: nextExpiresAt,
        lastUsedAt: now,
      },
      $inc: { useCount: 1 },
    }
  )

  return {
    ...mapFocusLinkPayload(doc),
    expiresAt: nextExpiresAt,
    lastUsedAt: now,
    useCount: Number(doc.useCount || 0) + 1,
  }
}

async function revokeFocusLinksForSession(sessionId) {
  if (!sessionId) return { modifiedCount: 0 }
  if (!AiChatFocusLinkModel?.updateMany) return { modifiedCount: 0 }
  return AiChatFocusLinkModel.updateMany(
    { sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), expiresAt: new Date() } }
  )
}

module.exports = {
  createFocusLink,
  validateFocusLink,
  revokeFocusLinksForSession,
  hashRouteKey,
  hashToken,
  hashPair,
}
