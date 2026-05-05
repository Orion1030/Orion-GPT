const DEFAULT_CACHE_TTL_MS = 60 * 1000

const PROVIDER_KEYS = ['openai', 'claude', 'gemini']
const REASONING_CONTROL_TYPES = ['none', 'effort', 'adaptive_effort', 'budget', 'level']
const DEFAULT_MODEL_CAPABILITIES = Object.freeze({
  supportsReasoning: false,
  reasoningControl: 'none',
  supportsStructuredOutputs: false,
  supportsContinuationState: false,
  supportsReasoningSummary: false,
})

function withCapabilities(modelId, label, sortOrder, extras = {}) {
  return {
    modelId,
    label,
    isActive: true,
    isDefault: false,
    sortOrder,
    deprecatedAt: null,
    capabilities: {
      ...DEFAULT_MODEL_CAPABILITIES,
      ...extras,
    },
  }
}

const FALLBACK_CATALOG = [
  {
    providerKey: 'openai',
    label: 'OpenAI',
    isActive: true,
    sortOrder: 10,
    models: [
      withCapabilities('gpt-5.2-mini', 'gpt-5.2-mini', 10, {
        supportsReasoning: true,
        reasoningControl: 'effort',
        supportsStructuredOutputs: true,
        supportsContinuationState: true,
        supportsReasoningSummary: true,
      }),
      withCapabilities('gpt-5.2', 'gpt-5.2', 20, {
        supportsReasoning: true,
        reasoningControl: 'effort',
        supportsStructuredOutputs: true,
        supportsContinuationState: true,
        supportsReasoningSummary: true,
      }),
      withCapabilities('gpt-5.4-mini', 'gpt-5.4-mini', 30, {
        supportsReasoning: true,
        reasoningControl: 'effort',
        supportsStructuredOutputs: true,
        supportsContinuationState: true,
        supportsReasoningSummary: true,
      }),
      withCapabilities('gpt-4.1', 'gpt-4.1', 40, {
        supportsStructuredOutputs: true,
      }),
      withCapabilities('gpt-4o', 'gpt-4o', 50, {
        supportsStructuredOutputs: true,
      }),
    ].map((model, index) => ({
      ...model,
      isDefault: index === 0,
    })),
  },
  {
    providerKey: 'claude',
    label: 'Claude',
    isActive: true,
    sortOrder: 20,
    models: [
      withCapabilities('claude-sonnet-4-0', 'claude-sonnet-4-0', 10, {
        supportsReasoning: true,
        reasoningControl: 'adaptive_effort',
        supportsStructuredOutputs: true,
        supportsContinuationState: true,
        supportsReasoningSummary: true,
      }),
      withCapabilities('claude-opus-4-0', 'claude-opus-4-0', 20, {
        supportsReasoning: true,
        reasoningControl: 'adaptive_effort',
        supportsStructuredOutputs: true,
        supportsContinuationState: true,
        supportsReasoningSummary: true,
      }),
      withCapabilities('claude-3-7-sonnet-latest', 'claude-3-7-sonnet-latest', 30, {
        supportsReasoning: true,
        reasoningControl: 'budget',
        supportsStructuredOutputs: true,
        supportsContinuationState: true,
        supportsReasoningSummary: true,
      }),
    ].map((model, index) => ({
      ...model,
      isDefault: index === 0,
    })),
  },
  {
    providerKey: 'gemini',
    label: 'Gemini',
    isActive: true,
    sortOrder: 30,
    models: [
      withCapabilities('gemini-2.5-pro', 'gemini-2.5-pro', 10, {
        supportsReasoning: true,
        reasoningControl: 'budget',
        supportsStructuredOutputs: true,
        supportsContinuationState: true,
        supportsReasoningSummary: true,
      }),
      withCapabilities('gemini-2.5-flash', 'gemini-2.5-flash', 20, {
        supportsReasoning: true,
        reasoningControl: 'budget',
        supportsStructuredOutputs: true,
        supportsContinuationState: true,
        supportsReasoningSummary: true,
      }),
      withCapabilities('gemini-2.0-flash', 'gemini-2.0-flash', 30, {
        supportsStructuredOutputs: true,
      }),
    ].map((model, index) => ({
      ...model,
      isDefault: index === 0,
    })),
  },
]

const catalogCache = {
  expiresAt: 0,
  items: null,
}

function shouldUseDatabase() {
  return process.env.NODE_ENV !== 'test'
}

function getCacheTtlMs() {
  const parsed = Number(process.env.AI_PROVIDER_CATALOG_CACHE_TTL_MS)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CACHE_TTL_MS
  return parsed
}

function sanitizeText(value, maxLen = 120) {
  return String(value || '').trim().slice(0, maxLen)
}

function sanitizeProviderKey(value) {
  const key = sanitizeText(value, 40).toLowerCase()
  if (!PROVIDER_KEYS.includes(key)) return ''
  return key
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toDateOrNull(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function getFallbackCatalog() {
  return normalizeCatalogItems(FALLBACK_CATALOG)
}

function findProviderEntry(catalog, providerKey) {
  const key = sanitizeProviderKey(providerKey)
  if (!key) return null
  return (Array.isArray(catalog) ? catalog : []).find((provider) => provider.providerKey === key) || null
}

function findFallbackModelEntry(providerKey, modelId) {
  const normalizedProviderKey = sanitizeProviderKey(providerKey)
  const normalizedModelId = sanitizeText(modelId, 120)
  if (!normalizedProviderKey || !normalizedModelId) return null

  const provider = FALLBACK_CATALOG.find((item) => item.providerKey === normalizedProviderKey)
  if (!provider) return null
  const model = (Array.isArray(provider.models) ? provider.models : []).find(
    (item) => item.modelId === normalizedModelId
  )
  if (!model) return null

  return {
    ...model,
    capabilities: {
      ...DEFAULT_MODEL_CAPABILITIES,
      ...(model.capabilities || {}),
    },
  }
}

function normalizeReasoningControl(value, fallback = DEFAULT_MODEL_CAPABILITIES.reasoningControl) {
  const normalized = sanitizeText(value, 40).toLowerCase()
  return REASONING_CONTROL_TYPES.includes(normalized) ? normalized : fallback
}

function normalizeModelCapabilities(input = {}, providerKey = '', modelId = '') {
  const fallbackCapabilities =
    findFallbackModelEntry(providerKey, modelId)?.capabilities || DEFAULT_MODEL_CAPABILITIES

  const supportsReasoning = toBoolean(
    input?.supportsReasoning,
    Boolean(fallbackCapabilities.supportsReasoning)
  )
  const reasoningControl = supportsReasoning
    ? normalizeReasoningControl(input?.reasoningControl, fallbackCapabilities.reasoningControl)
    : 'none'

  return {
    supportsReasoning,
    reasoningControl,
    supportsStructuredOutputs: toBoolean(
      input?.supportsStructuredOutputs,
      Boolean(fallbackCapabilities.supportsStructuredOutputs)
    ),
    supportsContinuationState: toBoolean(
      input?.supportsContinuationState,
      Boolean(fallbackCapabilities.supportsContinuationState)
    ),
    supportsReasoningSummary: toBoolean(
      input?.supportsReasoningSummary,
      Boolean(fallbackCapabilities.supportsReasoningSummary)
    ),
  }
}

function normalizeModelEntry(input, index = 0, providerKey = '') {
  const modelId = sanitizeText(input?.modelId, 120)
  if (!modelId) return null
  return {
    modelId,
    label: sanitizeText(input?.label, 120) || modelId,
    isActive: toBoolean(input?.isActive, true),
    isDefault: toBoolean(input?.isDefault, false),
    sortOrder: toNumber(input?.sortOrder, (index + 1) * 10),
    deprecatedAt: toDateOrNull(input?.deprecatedAt),
    capabilities: normalizeModelCapabilities(input?.capabilities, providerKey, modelId),
  }
}

function ensureProviderModelConsistency(provider) {
  const normalizedModels = []
  const seenModelIds = new Set()

  for (let index = 0; index < (Array.isArray(provider?.models) ? provider.models.length : 0); index += 1) {
    const model = normalizeModelEntry(provider.models[index], index, provider?.providerKey)
    if (!model) continue
    const key = model.modelId.toLowerCase()
    if (seenModelIds.has(key)) continue
    seenModelIds.add(key)
    normalizedModels.push(model)
  }

  normalizedModels.sort((a, b) => a.sortOrder - b.sortOrder || a.modelId.localeCompare(b.modelId))

  const activeModels = normalizedModels.filter((model) => model.isActive)
  let defaultModelId = ''
  for (const model of activeModels) {
    if (model.isDefault && !defaultModelId) {
      defaultModelId = model.modelId
    }
  }
  if (!defaultModelId && activeModels.length > 0) {
    defaultModelId = activeModels[0].modelId
  }
  for (const model of normalizedModels) {
    model.isDefault = Boolean(defaultModelId && model.modelId === defaultModelId)
  }

  return normalizedModels
}

function normalizeProviderEntry(input, index = 0) {
  const providerKey = sanitizeProviderKey(input?.providerKey)
  if (!providerKey) return null
  const label = sanitizeText(input?.label, 80) || providerKey.toUpperCase()
  const models = ensureProviderModelConsistency({
    providerKey,
    models: Array.isArray(input?.models) ? input.models : [],
  })
  return {
    providerKey,
    label,
    isActive: toBoolean(input?.isActive, true),
    sortOrder: toNumber(input?.sortOrder, (index + 1) * 10),
    models,
  }
}

function normalizeCatalogItems(items) {
  const normalized = []
  const seenProviders = new Set()
  for (let index = 0; index < (Array.isArray(items) ? items.length : 0); index += 1) {
    const provider = normalizeProviderEntry(items[index], index)
    if (!provider) continue
    if (seenProviders.has(provider.providerKey)) continue
    seenProviders.add(provider.providerKey)
    normalized.push(provider)
  }
  normalized.sort((a, b) => a.sortOrder - b.sortOrder || a.providerKey.localeCompare(b.providerKey))
  return normalized
}

function clearAiProviderCatalogCache() {
  catalogCache.expiresAt = 0
  catalogCache.items = null
}

function getAiProviderCatalogModel() {
  if (!shouldUseDatabase()) return null
  try {
    return require('../dbModels').AiProviderCatalogModel
  } catch (error) {
    console.warn('[AiProviderCatalog] unable to load model', error?.message || error)
    return null
  }
}

async function loadCatalogFromDb() {
  const model = getAiProviderCatalogModel()
  if (!model) return null

  const rows = await model
    .find({})
    .select('providerKey label isActive sortOrder models updatedAt createdAt')
    .sort({ sortOrder: 1, providerKey: 1 })
    .lean()
  return normalizeCatalogItems(rows)
}

async function listAiProviderCatalog({ includeInactive = false, forceRefresh = false } = {}) {
  const now = Date.now()
  if (!forceRefresh && catalogCache.items && catalogCache.expiresAt > now) {
    const cached = catalogCache.items
    if (includeInactive) return cached
    return filterActiveCatalog(cached)
  }

  let fullCatalog = null
  try {
    fullCatalog = await loadCatalogFromDb()
  } catch (error) {
    console.warn('[AiProviderCatalog] failed to load from db; using fallback', error?.message || error)
  }
  if (!fullCatalog || !fullCatalog.length) {
    fullCatalog = getFallbackCatalog()
  }

  catalogCache.items = fullCatalog
  catalogCache.expiresAt = now + getCacheTtlMs()

  if (includeInactive) return fullCatalog
  return filterActiveCatalog(fullCatalog)
}

function filterActiveCatalog(items) {
  return (Array.isArray(items) ? items : [])
    .filter((provider) => provider?.isActive)
    .map((provider) => ({
      ...provider,
      models: (Array.isArray(provider.models) ? provider.models : []).filter((model) => model?.isActive),
    }))
    .filter((provider) => provider.models.length > 0)
}

function findProviderModelEntry(catalog, providerKey, modelId) {
  const provider = findProviderEntry(catalog, providerKey)
  if (!provider) return null
  const normalizedModel = sanitizeText(modelId, 120)
  if (!normalizedModel) return null
  return provider.models.find((model) => model.modelId === normalizedModel) || null
}

function getDefaultProviderKey(catalog) {
  const providers = Array.isArray(catalog) ? catalog : []
  return providers.length ? providers[0].providerKey : 'openai'
}

function getDefaultModelId(catalog, providerKey) {
  const provider = findProviderEntry(catalog, providerKey)
  if (!provider) return ''
  const defaultModel = provider.models.find((model) => model.isDefault)
  if (defaultModel) return defaultModel.modelId
  return provider.models[0]?.modelId || ''
}

function isSupportedProviderModel(catalog, providerKey, modelId) {
  return Boolean(findProviderModelEntry(catalog, providerKey, modelId))
}

function getModelCapabilities(catalog, providerKey, modelId) {
  const model =
    findProviderModelEntry(catalog, providerKey, modelId) ||
    findFallbackModelEntry(providerKey, modelId)

  return normalizeModelCapabilities(model?.capabilities, providerKey, modelId)
}

function toProviderCatalogDto(provider) {
  return {
    providerKey: provider.providerKey,
    label: provider.label,
    isActive: Boolean(provider.isActive),
    sortOrder: toNumber(provider.sortOrder, 0),
    models: (Array.isArray(provider.models) ? provider.models : []).map((model) => ({
      modelId: model.modelId,
      label: model.label || model.modelId,
      isActive: Boolean(model.isActive),
      isDefault: Boolean(model.isDefault),
      sortOrder: toNumber(model.sortOrder, 0),
      deprecatedAt: model.deprecatedAt || null,
      capabilities: normalizeModelCapabilities(model.capabilities, provider.providerKey, model.modelId),
    })),
  }
}

async function upsertAiProviderCatalogEntry({
  providerKey,
  label,
  isActive,
  sortOrder,
  models,
  actorUserId = null,
} = {}) {
  const normalizedProviderKey = sanitizeProviderKey(providerKey)
  if (!normalizedProviderKey) {
    return { ok: false, status: 400, message: 'providerKey must be one of: openai, claude, gemini', data: null }
  }

  const normalized = normalizeProviderEntry(
    {
      providerKey: normalizedProviderKey,
      label,
      isActive,
      sortOrder,
      models,
    },
    PROVIDER_KEYS.indexOf(normalizedProviderKey)
  )
  if (!normalized) {
    return { ok: false, status: 400, message: 'Invalid provider payload', data: null }
  }
  if (!normalized.models.length) {
    return { ok: false, status: 400, message: 'At least one model is required', data: null }
  }
  if (normalized.isActive && !normalized.models.some((model) => model.isActive)) {
    return { ok: false, status: 400, message: 'Active provider must have at least one active model', data: null }
  }

  const currentCatalog = await listAiProviderCatalog({ includeInactive: true, forceRefresh: true })
  const nextCatalog = normalizeCatalogItems(
    currentCatalog
      .filter((provider) => provider.providerKey !== normalizedProviderKey)
      .concat([
        {
          providerKey: normalized.providerKey,
          label: normalized.label,
          isActive: normalized.isActive,
          sortOrder: normalized.sortOrder,
          models: normalized.models,
        },
      ])
  )
  if (!filterActiveCatalog(nextCatalog).length) {
    return {
      ok: false,
      status: 400,
      message: 'At least one active provider with an active model is required',
      data: null,
    }
  }

  const model = getAiProviderCatalogModel()
  if (!model) {
    return { ok: false, status: 500, message: 'AI provider catalog store is unavailable', data: null }
  }

  await model.findOneAndUpdate(
    { providerKey: normalizedProviderKey },
    {
      $set: {
        providerKey: normalized.providerKey,
        label: normalized.label,
        isActive: normalized.isActive,
        sortOrder: normalized.sortOrder,
        models: normalized.models,
        updatedByUserId: actorUserId || null,
      },
      $setOnInsert: {
        providerKey: normalized.providerKey,
      },
    },
    { upsert: true, returnDocument: 'after' }
  )

  clearAiProviderCatalogCache()
  const fullCatalog = await listAiProviderCatalog({ includeInactive: true, forceRefresh: true })
  const saved = findProviderEntry(fullCatalog, normalizedProviderKey)
  return { ok: true, status: 200, message: 'AI provider catalog updated', data: toProviderCatalogDto(saved) }
}

module.exports = {
  DEFAULT_MODEL_CAPABILITIES,
  PROVIDER_KEYS,
  REASONING_CONTROL_TYPES,
  clearAiProviderCatalogCache,
  findProviderEntry,
  findProviderModelEntry,
  getDefaultModelId,
  getDefaultProviderKey,
  getModelCapabilities,
  isSupportedProviderModel,
  listAiProviderCatalog,
  normalizeModelCapabilities,
  toProviderCatalogDto,
  upsertAiProviderCatalogEntry,
}
