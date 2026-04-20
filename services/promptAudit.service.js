const crypto = require('crypto')

let cachedPromptAuditModel = undefined

function shouldUseDatabase() {
  return process.env.NODE_ENV !== 'test'
}

function getPromptAuditModel() {
  if (cachedPromptAuditModel !== undefined) return cachedPromptAuditModel
  try {
    const dbModels = require('../dbModels')
    cachedPromptAuditModel = dbModels?.PromptAuditModel || null
  } catch (error) {
    console.warn('[PromptAudit] failed to resolve PromptAuditModel', error?.message || error)
    cachedPromptAuditModel = null
  }
  return cachedPromptAuditModel
}

function sanitizeText(value, maxLen = 100000) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeNullableId(value) {
  const normalized = sanitizeText(value, 80)
  return normalized || null
}

function toSafePage(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return parsed
}

function toSafePageSize(value, fallback = 20, max = 200) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(max, parsed)
}

function getRequestId(req, fallbackPrefix = 'prompt') {
  const fromHeader = req?.headers?.['x-request-id']
  if (typeof fromHeader === 'string' && fromHeader.trim()) return fromHeader.trim()
  return `${fallbackPrefix}-${crypto.randomUUID()}`
}

function getClientIp(req) {
  const forwardedFor = req?.headers?.['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    const first = forwardedFor.split(',')[0]
    if (first && first.trim()) return first.trim().slice(0, 120)
  }

  const realIp = req?.headers?.['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim().slice(0, 120)

  const fallbackIp =
    req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress || ''
  return sanitizeText(fallbackIp, 120)
}

function getUserAgent(req) {
  return sanitizeText(req?.headers?.['user-agent'], 1000)
}

function buildRequestAuditMeta(req, fallbackPrefix = 'prompt', source = 'api') {
  return {
    requestId: getRequestId(req, fallbackPrefix),
    source: sanitizeText(source, 120) || 'api',
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  }
}

async function appendPromptAudit({
  ownerUserId,
  actorUserId = null,
  actorType = 'system',
  action,
  promptId = null,
  promptName,
  type,
  profileId = null,
  beforeContext = null,
  afterContext = null,
  payload = {},
  requestId = null,
  source = 'system',
  ip = '',
  userAgent = '',
  eventVersion = 1,
  createdAt = null,
} = {}) {
  if (!shouldUseDatabase()) return null
  const PromptAuditModel = getPromptAuditModel()
  if (!PromptAuditModel) return null

  const ownerId = normalizeNullableId(ownerUserId)
  const normalizedPromptName = sanitizeText(promptName, 120)
  const normalizedType = sanitizeText(type, 50).toLowerCase()
  const normalizedAction = sanitizeText(action, 80)

  if (!ownerId) throw new Error('ownerUserId is required')
  if (!normalizedPromptName) throw new Error('promptName is required')
  if (!normalizedType) throw new Error('type is required')
  if (!normalizedAction) throw new Error('action is required')

  const document = {
    ownerUserId: ownerId,
    actorUserId: normalizeNullableId(actorUserId),
    actorType: sanitizeText(actorType, 20) || 'system',
    action: normalizedAction,
    promptId: normalizeNullableId(promptId),
    promptName: normalizedPromptName,
    type: normalizedType,
    profileId: normalizeNullableId(profileId),
    beforeContext: beforeContext == null ? null : sanitizeText(beforeContext, 120000),
    afterContext: afterContext == null ? null : sanitizeText(afterContext, 120000),
    payload: payload && typeof payload === 'object' ? payload : {},
    meta: {
      requestId: sanitizeText(requestId, 180) || null,
      source: sanitizeText(source, 120) || 'system',
      ip: sanitizeText(ip, 120),
      userAgent: sanitizeText(userAgent, 1000),
      eventVersion: Number(eventVersion || 1),
    },
  }

  if (createdAt) {
    document.createdAt = createdAt
  }

  const created = await PromptAuditModel.create(document)
  return created.toObject()
}

async function listPromptAudit({
  ownerUserId,
  promptName = null,
  type = null,
  profileId = undefined,
  actions = [],
  page = 1,
  pageSize = 20,
} = {}) {
  if (!shouldUseDatabase()) {
    return {
      items: [],
      page: toSafePage(page, 1),
      pageSize: toSafePageSize(pageSize, 20, 200),
      total: 0,
    }
  }
  const PromptAuditModel = getPromptAuditModel()
  if (!PromptAuditModel) {
    return {
      items: [],
      page: toSafePage(page, 1),
      pageSize: toSafePageSize(pageSize, 20, 200),
      total: 0,
    }
  }

  const ownerId = normalizeNullableId(ownerUserId)
  if (!ownerId) return null

  const safePage = toSafePage(page, 1)
  const safePageSize = toSafePageSize(pageSize, 20, 200)
  const skip = (safePage - 1) * safePageSize

  const filter = { ownerUserId: ownerId }
  const normalizedPromptName = sanitizeText(promptName, 120)
  if (normalizedPromptName) filter.promptName = normalizedPromptName

  const normalizedType = sanitizeText(type, 50).toLowerCase()
  if (normalizedType) filter.type = normalizedType

  if (profileId !== undefined) {
    const normalizedProfileId = normalizeNullableId(profileId)
    if (normalizedProfileId == null) {
      filter.$or = [{ profileId: null }, { profileId: { $exists: false } }]
    } else {
      filter.profileId = normalizedProfileId
    }
  }

  const normalizedActions = Array.isArray(actions)
    ? actions.map((action) => sanitizeText(action, 80)).filter(Boolean)
    : []
  if (normalizedActions.length) {
    filter.action = { $in: normalizedActions }
  }

  const [items, total] = await Promise.all([
    PromptAuditModel.find(filter)
      .populate('actorUserId', '_id name email')
      .populate('profileId', '_id fullName title')
      .populate('promptId', '_id promptName type profileId updatedAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(safePageSize)
      .lean(),
    PromptAuditModel.countDocuments(filter),
  ])

  return {
    items: items || [],
    page: safePage,
    pageSize: safePageSize,
    total: Number(total || 0),
  }
}

module.exports = {
  appendPromptAudit,
  listPromptAudit,
  buildRequestAuditMeta,
  getRequestId,
}
