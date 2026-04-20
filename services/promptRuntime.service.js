const DEFAULT_PROMPT_CACHE_TTL_MS = 60 * 1000
const promptCache = new Map()

function sanitizeText(value, maxLen = 240) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizePromptName(value) {
  return sanitizeText(value, 120)
}

function normalizeOwnerId(value) {
  return sanitizeText(value, 80)
}

function normalizeProfileId(value) {
  const normalized = sanitizeText(value, 80)
  return normalized || null
}

function normalizeType(value) {
  return sanitizeText(value, 50).toLowerCase()
}

function buildCacheKey(ownerId, promptName, type, profileId = null) {
  const ownerKey = normalizeOwnerId(ownerId)
  const promptKey = normalizePromptName(promptName)
  const typeKey = normalizeType(type)
  const profileKey = normalizeProfileId(profileId) || 'account-default'
  return `${ownerKey}::${promptKey}::${typeKey}::${profileKey}`
}

function getCacheTtlMs() {
  const parsed = Number(process.env.PROMPT_CACHE_TTL_MS)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PROMPT_CACHE_TTL_MS
  return parsed
}

function shouldUseDatabase() {
  return process.env.NODE_ENV !== 'test'
}

function getPromptModel() {
  if (!shouldUseDatabase()) return null
  try {
    return require('../dbModels').PromptModel
  } catch (error) {
    console.warn('[PromptRuntime] unable to load PromptModel', error?.message || error)
    return null
  }
}

function buildFallbackResolution(fallbackContext = '') {
  return {
    context: sanitizeText(fallbackContext, 100000),
    source: 'fallback_built_in',
    promptId: null,
    promptUpdatedAt: null,
  }
}

async function loadPromptFromDb({ ownerId, promptName, type, profileId = null } = {}) {
  const PromptModel = getPromptModel()
  if (!PromptModel) return null

  const normalizedOwnerId = normalizeOwnerId(ownerId)
  const normalizedPromptName = normalizePromptName(promptName)
  const normalizedType = normalizeType(type)
  const normalizedProfileId = normalizeProfileId(profileId)

  if (!normalizedOwnerId || !normalizedPromptName || !normalizedType) return null

  if (normalizedProfileId) {
    const profileScopedDoc = await PromptModel.findOne({
      owner: normalizedOwnerId,
      promptName: normalizedPromptName,
      type: normalizedType,
      profileId: normalizedProfileId,
    })
      .sort({ updatedAt: -1 })
      .select({ _id: 1, context: 1, updatedAt: 1 })
      .lean()

    const profileScopedContext = sanitizeText(profileScopedDoc?.context, 100000)
    if (profileScopedContext) {
      return {
        context: profileScopedContext,
        source: 'profile_override',
        promptId: profileScopedDoc?._id ? String(profileScopedDoc._id) : null,
        promptUpdatedAt: profileScopedDoc?.updatedAt || null,
      }
    }
  }

  const accountDefaultDoc = await PromptModel.findOne({
    owner: normalizedOwnerId,
    promptName: normalizedPromptName,
    type: normalizedType,
    $or: [{ profileId: null }, { profileId: { $exists: false } }],
  })
    .sort({ updatedAt: -1 })
    .select({ _id: 1, context: 1, updatedAt: 1 })
    .lean()

  const accountDefaultContext = sanitizeText(accountDefaultDoc?.context, 100000)
  if (!accountDefaultContext) return null

  return {
    context: accountDefaultContext,
    source: 'account_default',
    promptId: accountDefaultDoc?._id ? String(accountDefaultDoc._id) : null,
    promptUpdatedAt: accountDefaultDoc?.updatedAt || null,
  }
}

async function resolveManagedPromptContext({
  ownerId,
  profileId = null,
  promptName,
  type,
  fallbackContext = '',
} = {}) {
  const fallbackResolution = buildFallbackResolution(fallbackContext)
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  const normalizedProfileId = normalizeProfileId(profileId)
  const normalizedPromptName = normalizePromptName(promptName)
  const normalizedType = normalizeType(type)

  if (!normalizedOwnerId || !normalizedPromptName || !normalizedType) {
    return fallbackResolution
  }

  const cacheKey = buildCacheKey(
    normalizedOwnerId,
    normalizedPromptName,
    normalizedType,
    normalizedProfileId
  )
  const now = Date.now()
  const cached = promptCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return {
      context: sanitizeText(cached.context, 100000) || fallbackResolution.context,
      source: sanitizeText(cached.source, 80) || fallbackResolution.source,
      promptId: cached.promptId || null,
      promptUpdatedAt: cached.promptUpdatedAt || null,
    }
  }

  if (!shouldUseDatabase()) {
    return fallbackResolution
  }

  try {
    const resolved = await loadPromptFromDb({
      ownerId: normalizedOwnerId,
      profileId: normalizedProfileId,
      promptName: normalizedPromptName,
      type: normalizedType,
    })
    promptCache.set(cacheKey, {
      context: resolved?.context || null,
      source: resolved?.source || null,
      promptId: resolved?.promptId || null,
      promptUpdatedAt: resolved?.promptUpdatedAt || null,
      expiresAt: now + getCacheTtlMs(),
    })
    return resolved || fallbackResolution
  } catch (error) {
    console.warn(
      '[PromptRuntime] failed to resolve prompt from database; falling back',
      error?.message || error
    )
    return fallbackResolution
  }
}

async function getManagedPromptContext({
  ownerId,
  profileId = null,
  promptName,
  type,
  fallbackContext = '',
} = {}) {
  const resolved = await resolveManagedPromptContext({
    ownerId,
    profileId,
    promptName,
    type,
    fallbackContext,
  })
  return sanitizeText(resolved?.context, 100000)
}

function clearManagedPromptCache({ ownerId, promptName, type, profileId = null } = {}) {
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  const normalizedPromptName = normalizePromptName(promptName)
  const normalizedType = normalizeType(type)
  const normalizedProfileId = normalizeProfileId(profileId)
  if (normalizedOwnerId && normalizedPromptName && normalizedType) {
    if (normalizedProfileId) {
      promptCache.delete(
        buildCacheKey(normalizedOwnerId, normalizedPromptName, normalizedType, normalizedProfileId)
      )
      return
    }

    const keyPrefix = `${normalizedOwnerId}::${normalizedPromptName}::${normalizedType}::`
    for (const key of promptCache.keys()) {
      if (key.startsWith(keyPrefix)) {
        promptCache.delete(key)
      }
    }
    return
  }
  promptCache.clear()
}

module.exports = {
  resolveManagedPromptContext,
  getManagedPromptContext,
  clearManagedPromptCache,
}
