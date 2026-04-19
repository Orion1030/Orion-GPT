const DEFAULT_PROMPT_CACHE_TTL_MS = 60 * 1000
const promptCache = new Map()

function sanitizeText(value, maxLen = 240) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizePromptName(value) {
  return sanitizeText(value, 120)
}

function normalizeType(value) {
  return sanitizeText(value, 50).toLowerCase()
}

function buildCacheKey(promptName, type) {
  return `${normalizePromptName(promptName)}::${normalizeType(type)}`
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

async function loadPromptFromDb(promptName, type) {
  const PromptModel = getPromptModel()
  if (!PromptModel) return null

  const doc = await PromptModel.findOne({
    promptName: normalizePromptName(promptName),
    type: normalizeType(type),
  })
    .sort({ updatedAt: -1 })
    .select({ context: 1 })
    .lean()

  return sanitizeText(doc?.context, 100000) || null
}

async function getManagedPromptContext({ promptName, type, fallbackContext = '' } = {}) {
  const normalizedPromptName = normalizePromptName(promptName)
  const normalizedType = normalizeType(type)
  const fallback = sanitizeText(fallbackContext, 100000)

  if (!normalizedPromptName || !normalizedType) {
    return fallback
  }

  const cacheKey = buildCacheKey(normalizedPromptName, normalizedType)
  const now = Date.now()
  const cached = promptCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.context || fallback
  }

  if (!shouldUseDatabase()) {
    return fallback
  }

  try {
    const context = await loadPromptFromDb(normalizedPromptName, normalizedType)
    promptCache.set(cacheKey, {
      context,
      expiresAt: now + getCacheTtlMs(),
    })
    return context || fallback
  } catch (error) {
    console.warn(
      '[PromptRuntime] failed to resolve prompt from database; falling back',
      error?.message || error
    )
    return fallback
  }
}

function clearManagedPromptCache({ promptName, type } = {}) {
  const normalizedPromptName = normalizePromptName(promptName)
  const normalizedType = normalizeType(type)
  if (normalizedPromptName && normalizedType) {
    promptCache.delete(buildCacheKey(normalizedPromptName, normalizedType))
    return
  }
  promptCache.clear()
}

module.exports = {
  getManagedPromptContext,
  clearManagedPromptCache,
}
