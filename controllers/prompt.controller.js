const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { PromptModel } = require('../dbModels')
const { clearManagedPromptCache } = require('../services/promptRuntime.service')

function sanitizeText(value, maxLen = 100000) {
  return String(value || '').trim().slice(0, maxLen)
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

function toPromptDto(promptDoc) {
  if (!promptDoc) return null
  const raw = typeof promptDoc.toObject === 'function' ? promptDoc.toObject() : promptDoc

  return {
    _id: raw._id,
    id: raw._id ? String(raw._id) : '',
    promptName: sanitizeText(raw.promptName, 120),
    type: sanitizeText(raw.type, 50).toLowerCase(),
    context: sanitizeText(raw.context, 100000),
    owner: toPublicUserRef(raw.owner),
    updatedBy: toPublicUserRef(raw.updatedBy),
    ownerUserId: raw.owner
      ? String(typeof raw.owner === 'object' ? raw.owner._id || raw.owner.id || '' : raw.owner)
      : null,
    updatedByUserId: raw.updatedBy
      ? String(
          typeof raw.updatedBy === 'object' ? raw.updatedBy._id || raw.updatedBy.id || '' : raw.updatedBy
        )
      : null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  }
}

function buildListFilter(req) {
  const filter = {}
  const type = sanitizeText(req.query?.type, 50).toLowerCase()
  const promptName = sanitizeText(req.query?.promptName, 120)
  const q = sanitizeText(req.query?.q, 240)

  if (type) filter.type = type
  if (promptName) filter.promptName = promptName
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.$or = [
      { promptName: { $regex: escaped, $options: 'i' } },
      { type: { $regex: escaped, $options: 'i' } },
      { context: { $regex: escaped, $options: 'i' } },
    ]
  }
  return filter
}

function normalizePayload(body = {}) {
  return {
    promptName: sanitizeText(body.promptName, 120),
    type: sanitizeText(body.type, 50).toLowerCase(),
    context: sanitizeText(body.context, 100000),
  }
}

function validatePayload(payload) {
  if (!payload.promptName) return 'promptName is required'
  if (!payload.type) return 'type is required'
  if (!payload.context) return 'context is required'
  if (payload.context.length < 10) return 'context should be at least 10 characters'
  return null
}

function isDuplicateKeyError(error) {
  return Boolean(error && Number(error.code) === 11000)
}

async function populatePrompt(promptId) {
  return PromptModel.findById(promptId)
    .populate('owner', '_id name email')
    .populate('updatedBy', '_id name email')
}

exports.getPrompts = asyncErrorHandler(async (req, res) => {
  const prompts = await PromptModel.find(buildListFilter(req))
    .populate('owner', '_id name email')
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

  try {
    const created = new PromptModel({
      ...payload,
      owner: req.user._id,
      updatedBy: req.user._id,
    })
    await created.save()
    await clearManagedPromptCache({ promptName: payload.promptName, type: payload.type })

    const hydrated = await populatePrompt(created._id)
    return sendJsonResult(res, true, toPromptDto(hydrated), 'Prompt created successfully', 201)
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendJsonResult(
        res,
        false,
        null,
        'Prompt with this promptName and type already exists for the owner',
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

  const oldPromptKey = { promptName: existing.promptName, type: existing.type }

  existing.promptName = payload.promptName
  existing.type = payload.type
  existing.context = payload.context
  existing.updatedBy = req.user._id

  try {
    await existing.save()
    await clearManagedPromptCache()

    const hydrated = await populatePrompt(existing._id)
    return sendJsonResult(res, true, toPromptDto(hydrated), 'Prompt updated successfully')
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendJsonResult(
        res,
        false,
        null,
        'Prompt with this promptName and type already exists for the owner',
        400
      )
    }
    existing.promptName = oldPromptKey.promptName
    existing.type = oldPromptKey.type
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
  await clearManagedPromptCache({ promptName: prompt.promptName, type: prompt.type })

  return sendJsonResult(res, true, null, 'Prompt deleted successfully')
})
