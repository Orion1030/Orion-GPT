const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { PromptModel, ProfileModel, PromptAuditModel } = require('../dbModels')
const {
  clearManagedPromptCache,
  resolveManagedPromptContext,
} = require('../services/promptRuntime.service')
const {
  appendPromptAudit,
  listPromptAudit,
  buildRequestAuditMeta,
} = require('../services/promptAudit.service')
const { isAdminUser } = require('../utils/access')
const { RoleLevels } = require('../utils/constants')

const SYSTEM_PROMPT_TYPE = 'system'
const DEFAULT_USER_MANAGED_PROMPT_NAME = 'resume_generation'
const PROMPT_AUDIT_ACTIONS = {
  CREATED: 'prompt_created',
  UPDATED: 'prompt_updated',
  DELETED: 'prompt_deleted',
  RESET: 'prompt_reset',
  ROLLED_BACK: 'prompt_rolled_back',
}

function sanitizeText(value, maxLen = 100000) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeNullableId(value) {
  if (value === undefined) return undefined
  const normalized = sanitizeText(value, 80)
  if (!normalized) return null
  const lower = normalized.toLowerCase()
  if (lower === 'null' || lower === 'default' || lower === 'none') return null
  return normalized
}

function toPublicUserRef(userRef) {
  if (!userRef) return null
  if (typeof userRef === 'string') {
    return { id: userRef, name: '', email: '' }
  }

  const id = userRef._id || userRef.id
  return {
    id: id ? String(id) : '',
    name: sanitizeText(userRef.name, 160),
    email: sanitizeText(userRef.email, 320),
  }
}

function toPublicProfileRef(profileRef) {
  if (!profileRef) return null
  if (typeof profileRef === 'string') {
    return { id: profileRef, fullName: '', title: '' }
  }

  const id = profileRef._id || profileRef.id
  return {
    id: id ? String(id) : '',
    fullName: sanitizeText(profileRef.fullName, 180),
    title: sanitizeText(profileRef.title, 160),
  }
}

function toPromptDto(promptDoc) {
  if (!promptDoc) return null
  const raw = typeof promptDoc.toObject === 'function' ? promptDoc.toObject() : promptDoc
  const profileIdRaw = raw.profileId

  return {
    _id: raw._id,
    id: raw._id ? String(raw._id) : '',
    promptName: sanitizeText(raw.promptName, 120),
    type: sanitizeText(raw.type, 50).toLowerCase(),
    context: sanitizeText(raw.context, 100000),
    owner: toPublicUserRef(raw.owner),
    profile: toPublicProfileRef(profileIdRaw),
    updatedBy: toPublicUserRef(raw.updatedBy),
    ownerUserId: raw.owner
      ? String(typeof raw.owner === 'object' ? raw.owner._id || raw.owner.id || '' : raw.owner)
      : null,
    profileId:
      profileIdRaw == null
        ? null
        : String(typeof profileIdRaw === 'object' ? profileIdRaw._id || profileIdRaw.id || '' : profileIdRaw),
    updatedByUserId: raw.updatedBy
      ? String(
          typeof raw.updatedBy === 'object' ? raw.updatedBy._id || raw.updatedBy.id || '' : raw.updatedBy
        )
      : null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  }
}

function toPromptAuditDto(auditDoc) {
  if (!auditDoc) return null
  const raw = typeof auditDoc.toObject === 'function' ? auditDoc.toObject() : auditDoc
  const actor = raw.actorUserId
  const profileRef = raw.profileId
  const promptRef = raw.promptId

  return {
    _id: raw._id,
    id: raw._id ? String(raw._id) : '',
    ownerUserId: raw.ownerUserId ? String(raw.ownerUserId) : '',
    actorType: sanitizeText(raw.actorType, 20) || 'system',
    actorUser: actor
      ? {
          id: String(actor._id || actor.id || ''),
          name: sanitizeText(actor.name, 160),
          email: sanitizeText(actor.email, 320),
        }
      : null,
    action: sanitizeText(raw.action, 80),
    prompt: promptRef
      ? {
          id: String(promptRef._id || promptRef.id || ''),
          promptName: sanitizeText(promptRef.promptName, 120),
          type: sanitizeText(promptRef.type, 50).toLowerCase(),
          profileId: promptRef.profileId ? String(promptRef.profileId) : null,
          updatedAt: promptRef.updatedAt || null,
        }
      : null,
    promptId: raw.promptId ? String(typeof raw.promptId === 'object' ? raw.promptId._id || raw.promptId.id || '' : raw.promptId) : null,
    promptName: sanitizeText(raw.promptName, 120),
    type: sanitizeText(raw.type, 50).toLowerCase(),
    profile: toPublicProfileRef(profileRef),
    profileId:
      profileRef == null
        ? null
        : String(typeof profileRef === 'object' ? profileRef._id || profileRef.id || '' : profileRef),
    beforeContext: raw.beforeContext == null ? null : sanitizeText(raw.beforeContext, 120000),
    afterContext: raw.afterContext == null ? null : sanitizeText(raw.afterContext, 120000),
    payload: raw.payload && typeof raw.payload === 'object' ? raw.payload : {},
    meta: {
      requestId: sanitizeText(raw.meta?.requestId, 180) || null,
      source: sanitizeText(raw.meta?.source, 120) || '',
      ip: sanitizeText(raw.meta?.ip, 120) || '',
      userAgent: sanitizeText(raw.meta?.userAgent, 300) || '',
      eventVersion: Number(raw.meta?.eventVersion || 1),
    },
    createdAt: raw.createdAt || null,
  }
}

function getActorTypeFromUser(user) {
  return isAdminUser(user) ? 'admin' : 'user'
}

function isSuperAdminUser(user) {
  return Number(user?.role) === Number(RoleLevels.SUPER_ADMIN)
}

async function appendPromptChangeAudit({
  req,
  ownerUserId,
  promptDoc,
  promptName,
  type,
  profileId = null,
  action,
  beforeContext = null,
  afterContext = null,
  payload = {},
  fallbackPrefix = 'prompt-change',
  source = 'api.prompt',
}) {
  try {
    const requestMeta = buildRequestAuditMeta(req, fallbackPrefix, source)
    await appendPromptAudit({
      ownerUserId,
      actorUserId: req?.user?._id || null,
      actorType: getActorTypeFromUser(req?.user),
      action,
      promptId: promptDoc?._id || promptDoc?.id || null,
      promptName,
      type,
      profileId: profileId || null,
      beforeContext,
      afterContext,
      payload,
      requestId: requestMeta.requestId,
      source: requestMeta.source,
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })
  } catch (error) {
    console.warn('[PromptAudit] failed to append prompt change event', error?.message || error)
  }
}

async function ensureProfileForOwner(profileId, ownerId) {
  if (profileId == null) return { ok: true, profileId: null }

  const profile = await ProfileModel.findOne({ _id: profileId, userId: ownerId })
    .select('_id')
    .lean()
  if (!profile) {
    return {
      ok: false,
      status: 404,
      message: 'Profile not found for this account',
    }
  }

  return { ok: true, profileId: profile._id }
}

async function resolveManagedPromptScope({ reqUser, profileId }) {
  const requesterUserId = reqUser?._id || null
  if (!requesterUserId) {
    return {
      ok: false,
      status: 401,
      message: 'Unauthorized',
    }
  }

  if (profileId == null) {
    return {
      ok: true,
      profileId: null,
      ownerUserId: requesterUserId,
    }
  }

  const profile = await ProfileModel.findById(profileId)
    .select('_id userId')
    .lean()
  if (!profile || !profile.userId) {
    return {
      ok: false,
      status: 404,
      message: 'Profile not found',
    }
  }

  const isOwner =
    String(profile.userId) === String(requesterUserId)
  if (!isOwner && !isAdminUser(reqUser)) {
    return {
      ok: false,
      status: 404,
      message: 'Profile not found for this account',
    }
  }

  return {
    ok: true,
    profileId: profile._id,
    ownerUserId: profile.userId,
  }
}

function buildListFilter(req) {
  const filter = {}
  const type = sanitizeText(req.query?.type, 50).toLowerCase()
  const promptName = sanitizeText(req.query?.promptName, 120)
  const q = sanitizeText(req.query?.q, 240)
  const profileId = normalizeNullableId(req.query?.profileId)
  const hasProfileIdFilter = Object.prototype.hasOwnProperty.call(req.query || {}, 'profileId')

  if (type) filter.type = type
  if (promptName) filter.promptName = promptName
  if (hasProfileIdFilter) {
    if (profileId == null) {
      filter.$or = [{ profileId: null }, { profileId: { $exists: false } }]
    } else {
      filter.profileId = profileId
    }
  }
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const searchFilter = [
      { promptName: { $regex: escaped, $options: 'i' } },
      { type: { $regex: escaped, $options: 'i' } },
      { context: { $regex: escaped, $options: 'i' } },
    ]
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchFilter }]
      delete filter.$or
    } else {
      filter.$or = searchFilter
    }
  }
  return filter
}

function normalizePayload(body = {}) {
  return {
    promptName: sanitizeText(body.promptName, 120),
    type: sanitizeText(body.type, 50).toLowerCase(),
    context: sanitizeText(body.context, 100000),
    profileId: normalizeNullableId(body.profileId),
  }
}

function validatePayload(payload) {
  if (!payload.promptName) return 'promptName is required'
  if (!payload.type) return 'type is required'
  if (!payload.context) return 'context is required'
  if (payload.context.length < 10) return 'context should be at least 10 characters'
  return null
}

function resolveManagedPromptName(rawName) {
  const normalized = sanitizeText(rawName, 120)
  return normalized || DEFAULT_USER_MANAGED_PROMPT_NAME
}

function buildNullProfileFilter() {
  return [{ profileId: null }, { profileId: { $exists: false } }]
}

function buildProfileScopeFilter(profileId) {
  if (profileId == null) {
    return { $or: buildNullProfileFilter() }
  }
  return { profileId }
}

function buildOwnerPromptFilter({ ownerId, promptName, type, profileId }) {
  const filter = {
    owner: ownerId,
    promptName: sanitizeText(promptName, 120),
    type: sanitizeText(type, 50).toLowerCase(),
  }
  if (profileId == null) {
    filter.$or = [{ profileId: null }, { profileId: { $exists: false } }]
  } else {
    filter.profileId = profileId
  }
  return filter
}

function isDuplicateKeyError(error) {
  return Boolean(error && Number(error.code) === 11000)
}

function isRollbackEligibleAuditAction(action) {
  const normalized = sanitizeText(action, 80)
  if (!normalized) return false
  return normalized !== 'prompt_runtime_used' && normalized !== PROMPT_AUDIT_ACTIONS.ROLLED_BACK
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

async function populatePrompt(promptId) {
  return PromptModel.findById(promptId)
    .populate('owner', '_id name email')
    .populate('profileId', '_id fullName title')
    .populate('updatedBy', '_id name email')
}

exports.getPrompts = asyncErrorHandler(async (req, res) => {
  const prompts = await PromptModel.find(buildListFilter(req))
    .populate('owner', '_id name email')
    .populate('profileId', '_id fullName title')
    .populate('updatedBy', '_id name email')
    .sort({ updatedAt: -1, promptName: 1 })

  return sendJsonResult(res, true, prompts.map(toPromptDto))
})

exports.getPromptById = asyncErrorHandler(async (req, res) => {
  const prompt = await populatePrompt(req.params.promptId)
  if (!prompt) {
    return sendJsonResult(res, false, null, 'Prompt not found', 404)
  }
  return sendJsonResult(res, true, toPromptDto(prompt))
})

exports.createPrompt = asyncErrorHandler(async (req, res) => {
  const payload = normalizePayload(req.body)
  const validationError = validatePayload(payload)
  if (validationError) {
    return sendJsonResult(res, false, null, validationError, 400)
  }

  const profileCheck = await ensureProfileForOwner(payload.profileId, req.user._id)
  if (!profileCheck.ok) {
    return sendJsonResult(res, false, null, profileCheck.message, profileCheck.status)
  }

  try {
    const created = new PromptModel({
      ...payload,
      profileId: profileCheck.profileId,
      owner: req.user._id,
      updatedBy: req.user._id,
    })
    await created.save()
    await clearManagedPromptCache({
      ownerId: req.user._id,
      promptName: payload.promptName,
      type: payload.type,
      profileId: profileCheck.profileId,
      clearAcrossOwners: profileCheck.profileId == null,
    })
    await appendPromptChangeAudit({
      req,
      ownerUserId: req.user._id,
      promptDoc: created,
      promptName: payload.promptName,
      type: payload.type,
      profileId: profileCheck.profileId,
      action: PROMPT_AUDIT_ACTIONS.CREATED,
      beforeContext: null,
      afterContext: payload.context,
      payload: {
        changeSource: 'admin_prompt_create',
      },
      fallbackPrefix: 'prompt-created',
      source: 'api.prompt.admin',
    })

    const hydrated = await populatePrompt(created._id)
    return sendJsonResult(res, true, toPromptDto(hydrated), 'Prompt created successfully', 201)
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendJsonResult(
        res,
        false,
        null,
        'Prompt with this promptName and type already exists for the owner/profile',
        400
      )
    }
    throw error
  }
})

exports.updatePrompt = asyncErrorHandler(async (req, res) => {
  const { promptId } = req.params
  const payload = normalizePayload(req.body)
  const validationError = validatePayload(payload)
  if (validationError) {
    return sendJsonResult(res, false, null, validationError, 400)
  }

  const existing = await PromptModel.findById(promptId)
  if (!existing) {
    return sendJsonResult(res, false, null, 'Prompt not found', 404)
  }

  const profileCheck = await ensureProfileForOwner(payload.profileId, req.user._id)
  if (!profileCheck.ok) {
    return sendJsonResult(res, false, null, profileCheck.message, profileCheck.status)
  }

  const oldPromptKey = {
    ownerId: existing.owner,
    profileId: existing.profileId || null,
    promptName: existing.promptName,
    type: existing.type,
    context: existing.context || '',
  }

  existing.promptName = payload.promptName
  existing.type = payload.type
  existing.context = payload.context
  existing.profileId = profileCheck.profileId
  existing.updatedBy = req.user._id

  try {
    await existing.save()
    await clearManagedPromptCache(oldPromptKey)
    await clearManagedPromptCache({
      ownerId: existing.owner,
      profileId: existing.profileId || null,
      promptName: existing.promptName,
      type: existing.type,
      clearAcrossOwners: (existing.profileId || null) == null || (oldPromptKey.profileId || null) == null,
    })
    await appendPromptChangeAudit({
      req,
      ownerUserId: existing.owner,
      promptDoc: existing,
      promptName: existing.promptName,
      type: existing.type,
      profileId: existing.profileId || null,
      action: PROMPT_AUDIT_ACTIONS.UPDATED,
      beforeContext: oldPromptKey.context,
      afterContext: existing.context,
      payload: {
        previousPromptName: oldPromptKey.promptName,
        previousType: oldPromptKey.type,
        previousProfileId: oldPromptKey.profileId ? String(oldPromptKey.profileId) : null,
      },
      fallbackPrefix: 'prompt-updated',
      source: 'api.prompt.admin',
    })

    const hydrated = await populatePrompt(existing._id)
    return sendJsonResult(res, true, toPromptDto(hydrated), 'Prompt updated successfully')
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendJsonResult(
        res,
        false,
        null,
        'Prompt with this promptName and type already exists for the owner/profile',
        400
      )
    }
    existing.promptName = oldPromptKey.promptName
    existing.type = oldPromptKey.type
    existing.profileId = oldPromptKey.profileId
    throw error
  }
})

exports.deletePrompt = asyncErrorHandler(async (req, res) => {
  const { promptId } = req.params
  const prompt = await PromptModel.findById(promptId).lean()
  if (!prompt) {
    return sendJsonResult(res, false, null, 'Prompt not found', 404)
  }

  await appendPromptChangeAudit({
    req,
    ownerUserId: prompt.owner,
    promptDoc: { _id: prompt._id },
    promptName: prompt.promptName,
    type: prompt.type,
    profileId: prompt.profileId || null,
    action: PROMPT_AUDIT_ACTIONS.DELETED,
    beforeContext: prompt.context || null,
    afterContext: null,
    payload: {
      changeSource: 'admin_prompt_delete',
    },
    fallbackPrefix: 'prompt-deleted',
    source: 'api.prompt.admin',
  })
  await PromptModel.deleteOne({ _id: promptId })
  await clearManagedPromptCache({
    ownerId: prompt.owner,
    profileId: prompt.profileId || null,
    promptName: prompt.promptName,
    type: prompt.type,
    clearAcrossOwners: (prompt.profileId || null) == null,
  })

  return sendJsonResult(res, true, null, 'Prompt deleted successfully')
})

exports.getMySystemPrompt = asyncErrorHandler(async (req, res) => {
  const promptName = resolveManagedPromptName(req.query?.promptName)
  const profileId = normalizeNullableId(req.query?.profileId)

  const scope = await resolveManagedPromptScope({
    reqUser: req.user,
    profileId,
  })
  if (!scope.ok) {
    return sendJsonResult(res, false, null, scope.message, scope.status)
  }

  const prompt = await PromptModel.findOne(
    buildOwnerPromptFilter({
      ownerId: scope.ownerUserId,
      profileId: scope.profileId,
      promptName,
      type: SYSTEM_PROMPT_TYPE,
    })
  )
    .populate('owner', '_id name email')
    .populate('profileId', '_id fullName title')
    .populate('updatedBy', '_id name email')
    .sort({ updatedAt: -1 })

  return sendJsonResult(res, true, prompt ? toPromptDto(prompt) : null)
})

exports.getMyEffectiveSystemPrompt = asyncErrorHandler(async (req, res) => {
  const promptName = resolveManagedPromptName(req.query?.promptName)
  const profileId = normalizeNullableId(req.query?.profileId)

  const scope = await resolveManagedPromptScope({
    reqUser: req.user,
    profileId,
  })
  if (!scope.ok) {
    return sendJsonResult(res, false, null, scope.message, scope.status)
  }

  const resolved = await resolveManagedPromptContext({
    ownerId: scope.ownerUserId,
    profileId: scope.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
    fallbackContext: '',
  })

  const resolvedSource = sanitizeText(resolved?.source, 80) || 'no_prompt_configured'
  const redactBasePromptContext =
    resolvedSource === 'super_admin_base' && !isSuperAdminUser(req.user)

  return sendJsonResult(res, true, {
    promptName,
    type: SYSTEM_PROMPT_TYPE,
    profileId: scope.profileId ? String(scope.profileId) : null,
    context: redactBasePromptContext ? '' : sanitizeText(resolved?.context, 100000),
    source: resolvedSource,
    promptId: redactBasePromptContext ? null : resolved?.promptId || null,
    promptUpdatedAt: redactBasePromptContext ? null : resolved?.promptUpdatedAt || null,
    contextRedacted: redactBasePromptContext,
  })
})

exports.upsertMySystemPrompt = asyncErrorHandler(async (req, res) => {
  const promptName = resolveManagedPromptName(req.body?.promptName)
  const profileId = normalizeNullableId(req.body?.profileId)
  const context = sanitizeText(req.body?.context, 100000)

  if (!context) {
    return sendJsonResult(res, false, null, 'context is required', 400)
  }
  if (context.length < 10) {
    return sendJsonResult(res, false, null, 'context should be at least 10 characters', 400)
  }

  const scope = await resolveManagedPromptScope({
    reqUser: req.user,
    profileId,
  })
  if (!scope.ok) {
    return sendJsonResult(res, false, null, scope.message, scope.status)
  }

  const filter = buildOwnerPromptFilter({
    ownerId: scope.ownerUserId,
    profileId: scope.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
  })
  const existing = await PromptModel.findOne(filter).select('_id context profileId promptName type').lean()

  let upsertedPrompt
  try {
    upsertedPrompt = await PromptModel.findOneAndUpdate(
      filter,
      {
        $set: {
          context,
          updatedBy: req.user._id,
          profileId: scope.profileId,
        },
        $setOnInsert: {
          owner: scope.ownerUserId,
          promptName,
          type: SYSTEM_PROMPT_TYPE,
        },
      },
      {
        new: true,
        runValidators: true,
        upsert: true,
      }
    )
      .populate('owner', '_id name email')
      .populate('profileId', '_id fullName title')
      .populate('updatedBy', '_id name email')
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendJsonResult(
        res,
        false,
        null,
        'Prompt with this promptName and type already exists for the owner/profile',
        400
      )
    }
    throw error
  }

  await clearManagedPromptCache({
    ownerId: scope.ownerUserId,
    profileId: scope.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
    clearAcrossOwners: scope.profileId == null,
  })
  await appendPromptChangeAudit({
    req,
    ownerUserId: scope.ownerUserId,
    promptDoc: upsertedPrompt,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
    profileId: scope.profileId,
    action: existing ? PROMPT_AUDIT_ACTIONS.UPDATED : PROMPT_AUDIT_ACTIONS.CREATED,
    beforeContext: existing?.context || null,
    afterContext: upsertedPrompt?.context || context,
    payload: {
      changeSource: existing ? 'self_prompt_update' : 'self_prompt_create',
      managedScope: scope.profileId ? 'profile_override' : 'account_default',
    },
    fallbackPrefix: 'prompt-me-upsert',
    source: 'api.prompt.self',
  })

  return sendJsonResult(
    res,
    true,
    toPromptDto(upsertedPrompt),
    existing ? 'Prompt updated successfully' : 'Prompt created successfully'
  )
})

exports.deleteMySystemPrompt = asyncErrorHandler(async (req, res) => {
  const promptName = resolveManagedPromptName(req.query?.promptName || req.body?.promptName)
  const profileId = normalizeNullableId(req.query?.profileId || req.body?.profileId)

  const scope = await resolveManagedPromptScope({
    reqUser: req.user,
    profileId,
  })
  if (!scope.ok) {
    return sendJsonResult(res, false, null, scope.message, scope.status)
  }

  const filter = buildOwnerPromptFilter({
    ownerId: scope.ownerUserId,
    profileId: scope.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
  })

  const existing = await PromptModel.findOne(filter)
    .select('_id context promptName type profileId owner')
    .lean()

  if (existing) {
    await appendPromptChangeAudit({
      req,
      ownerUserId: scope.ownerUserId,
      promptDoc: { _id: existing._id },
      promptName: existing.promptName || promptName,
      type: existing.type || SYSTEM_PROMPT_TYPE,
      profileId: existing.profileId || null,
      action: PROMPT_AUDIT_ACTIONS.RESET,
      beforeContext: existing.context || null,
      afterContext: null,
      payload: {
        changeSource: 'self_prompt_reset',
        managedScope: existing.profileId ? 'profile_override' : 'account_default',
      },
      fallbackPrefix: 'prompt-me-reset',
      source: 'api.prompt.self',
    })
  }

  await PromptModel.deleteOne(filter)
  await clearManagedPromptCache({
    ownerId: scope.ownerUserId,
    profileId: scope.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
    clearAcrossOwners: scope.profileId == null,
  })

  return sendJsonResult(res, true, null, 'Prompt deleted successfully')
})

exports.rollbackMySystemPrompt = asyncErrorHandler(async (req, res) => {
  const auditId = sanitizeText(req.body?.auditId, 80)
  const promptName = resolveManagedPromptName(req.body?.promptName)
  const profileId = normalizeNullableId(req.body?.profileId)

  if (!auditId) {
    return sendJsonResult(res, false, null, 'auditId is required', 400)
  }

  const scope = await resolveManagedPromptScope({
    reqUser: req.user,
    profileId,
  })
  if (!scope.ok) {
    return sendJsonResult(res, false, null, scope.message, scope.status)
  }

  const auditFilter = {
    _id: auditId,
    ownerUserId: scope.ownerUserId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
    ...buildProfileScopeFilter(scope.profileId),
  }

  const sourceAudit = await PromptAuditModel.findOne(auditFilter).lean()
  if (!sourceAudit) {
    return sendJsonResult(res, false, null, 'Prompt audit event not found', 404)
  }
  if (!isRollbackEligibleAuditAction(sourceAudit.action)) {
    return sendJsonResult(res, false, null, 'This audit event cannot be rolled back', 400)
  }

  const rollbackTargetContext = sourceAudit.afterContext == null
    ? null
    : sanitizeText(sourceAudit.afterContext, 100000)
  if (rollbackTargetContext != null && rollbackTargetContext.length < 10) {
    return sendJsonResult(
      res,
      false,
      null,
      'Cannot rollback because selected historical context is invalid',
      400
    )
  }

  const filter = buildOwnerPromptFilter({
    ownerId: scope.ownerUserId,
    profileId: scope.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
  })
  const existing = await PromptModel.findOne(filter).select('_id context promptName type profileId owner').lean()

  let rolledBackPrompt = null
  if (rollbackTargetContext == null) {
    await PromptModel.deleteOne(filter)
  } else {
    rolledBackPrompt = await PromptModel.findOneAndUpdate(
      filter,
      {
        $set: {
          context: rollbackTargetContext,
          updatedBy: req.user._id,
          profileId: scope.profileId,
        },
        $setOnInsert: {
          owner: scope.ownerUserId,
          promptName,
          type: SYSTEM_PROMPT_TYPE,
        },
      },
      {
        new: true,
        runValidators: true,
        upsert: true,
      }
    )
      .populate('owner', '_id name email')
      .populate('profileId', '_id fullName title')
      .populate('updatedBy', '_id name email')
  }

  await clearManagedPromptCache({
    ownerId: scope.ownerUserId,
    profileId: scope.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
    clearAcrossOwners: scope.profileId == null,
  })

  await appendPromptChangeAudit({
    req,
    ownerUserId: scope.ownerUserId,
    promptDoc: rolledBackPrompt || existing || null,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
    profileId: scope.profileId,
    action: PROMPT_AUDIT_ACTIONS.ROLLED_BACK,
    beforeContext: existing?.context || null,
    afterContext: rollbackTargetContext,
    payload: {
      changeSource: 'self_prompt_rollback',
      managedScope: scope.profileId ? 'profile_override' : 'account_default',
      rollbackFromAuditId: sourceAudit?._id ? String(sourceAudit._id) : auditId,
      rollbackFromAction: sanitizeText(sourceAudit?.action, 80),
      rollbackFromCreatedAt: sourceAudit?.createdAt || null,
    },
    fallbackPrefix: 'prompt-me-rollback',
    source: 'api.prompt.self',
  })

  return sendJsonResult(
    res,
    true,
    rolledBackPrompt ? toPromptDto(rolledBackPrompt) : null,
    'Prompt rolled back successfully'
  )
})

exports.getMySystemPromptAudit = asyncErrorHandler(async (req, res) => {
  const promptName = resolveManagedPromptName(req.query?.promptName)
  const hasProfileFilter = Object.prototype.hasOwnProperty.call(req.query || {}, 'profileId')
  const profileId = normalizeNullableId(req.query?.profileId)
  const page = toSafePage(req.query?.page, 1)
  const pageSize = toSafePageSize(req.query?.pageSize, 20, 200)
  const actionQuery = sanitizeText(req.query?.action, 400)
  const actions = actionQuery
    ? actionQuery
        .split(',')
        .map((value) => sanitizeText(value, 80))
        .filter(Boolean)
    : []

  let scopedProfileId = undefined
  let scopedOwnerUserId = req.user._id
  if (hasProfileFilter) {
    const scope = await resolveManagedPromptScope({
      reqUser: req.user,
      profileId,
    })
    if (!scope.ok) {
      return sendJsonResult(res, false, null, scope.message, scope.status)
    }
    scopedProfileId = scope.profileId
    scopedOwnerUserId = scope.ownerUserId
  }

  const result = await listPromptAudit({
    ownerUserId: scopedOwnerUserId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
    profileId: scopedProfileId,
    actions,
    page,
    pageSize,
  })

  return sendJsonResult(res, true, {
    items: (result?.items || []).map(toPromptAuditDto),
    page: result?.page || page,
    pageSize: result?.pageSize || pageSize,
    total: result?.total || 0,
  })
})
