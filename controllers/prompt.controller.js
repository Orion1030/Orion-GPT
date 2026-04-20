const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { PromptModel, ProfileModel } = require('../dbModels')
const { clearManagedPromptCache } = require('../services/promptRuntime.service')

const SYSTEM_PROMPT_TYPE = 'system'
const DEFAULT_USER_MANAGED_PROMPT_NAME = 'resume_generation'

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

  await PromptModel.deleteOne({ _id: promptId })
  await clearManagedPromptCache({
    ownerId: prompt.owner,
    profileId: prompt.profileId || null,
    promptName: prompt.promptName,
    type: prompt.type,
  })

  return sendJsonResult(res, true, null, 'Prompt deleted successfully')
})

exports.getMySystemPrompt = asyncErrorHandler(async (req, res) => {
  const promptName = resolveManagedPromptName(req.query?.promptName)
  const profileId = normalizeNullableId(req.query?.profileId)

  const profileCheck = await ensureProfileForOwner(profileId, req.user._id)
  if (!profileCheck.ok) {
    return sendJsonResult(res, false, null, profileCheck.message, profileCheck.status)
  }

  const prompt = await PromptModel.findOne(
    buildOwnerPromptFilter({
      ownerId: req.user._id,
      profileId: profileCheck.profileId,
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

  const profileCheck = await ensureProfileForOwner(profileId, req.user._id)
  if (!profileCheck.ok) {
    return sendJsonResult(res, false, null, profileCheck.message, profileCheck.status)
  }

  const filter = buildOwnerPromptFilter({
    ownerId: req.user._id,
    profileId: profileCheck.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
  })
  const existing = await PromptModel.findOne(filter).select('_id').lean()

  let upsertedPrompt
  try {
    upsertedPrompt = await PromptModel.findOneAndUpdate(
      filter,
      {
        $set: {
          context,
          updatedBy: req.user._id,
          profileId: profileCheck.profileId,
        },
        $setOnInsert: {
          owner: req.user._id,
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
    ownerId: req.user._id,
    profileId: profileCheck.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
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

  const profileCheck = await ensureProfileForOwner(profileId, req.user._id)
  if (!profileCheck.ok) {
    return sendJsonResult(res, false, null, profileCheck.message, profileCheck.status)
  }

  const filter = buildOwnerPromptFilter({
    ownerId: req.user._id,
    profileId: profileCheck.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
  })

  await PromptModel.deleteOne(filter)
  await clearManagedPromptCache({
    ownerId: req.user._id,
    profileId: profileCheck.profileId,
    promptName,
    type: SYSTEM_PROMPT_TYPE,
  })

  return sendJsonResult(res, true, null, 'Prompt deleted successfully')
})
