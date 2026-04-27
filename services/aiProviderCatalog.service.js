const DEFAULT_CACHE_TTL_MS = 60 * 1000

const PROVIDER_KEYS = ['openai', 'claude', 'gemini']

const FALLBACK_CATALOG = [
  {
    providerKey: 'openai',
    label: 'OpenAI',
    isActive: true,
    sortOrder: 10,
    models: [
      { modelId: 'gpt-4o-mini', label: 'gpt-4o-mini', isActive: true, isDefault: true, sortOrder: 10, deprecatedAt: null },
      { modelId: 'gpt-4o', label: 'gpt-4o', isActive: true, isDefault: false, sortOrder: 20, deprecatedAt: null },
      { modelId: 'gpt-4.1', label: 'gpt-4.1', isActive: true, isDefault: false, sortOrder: 30, deprecatedAt: null },
      { modelId: 'gpt-5.4-mini', label: 'gpt-5.4-mini', isActive: true, isDefault: false, sortOrder: 40, deprecatedAt: null },
    ],
  },
  {
    providerKey: 'claude',
    label: 'Claude',
    isActive: true,
    sortOrder: 20,
    models: [
      {
        modelId: 'claude-3-7-sonnet-latest',
        label: 'claude-3-7-sonnet-latest',
        isActive: true,
        isDefault: true,
        sortOrder: 10,
        deprecatedAt: null,
      },
      {
        modelId: 'claude-3-5-sonnet-latest',
        label: 'claude-3-5-sonnet-latest',
        isActive: true,
        isDefault: false,
        sortOrder: 20,
        deprecatedAt: null,
      },
      {
        modelId: 'claude-3-5-haiku-latest',
        label: 'claude-3-5-haiku-latest',
        isActive: true,
        isDefault: false,
        sortOrder: 30,
        deprecatedAt: null,
      },
    ],
  },
  {
    providerKey: 'gemini',
    label: 'Gemini',
    isActive: true,
    sortOrder: 30,
    models: [
      { modelId: 'gemini-2.5-pro', label: 'gemini-2.5-pro', isActive: true, isDefault: true, sortOrder: 10, deprecatedAt: null },
      { modelId: 'gemini-2.5-flash', label: 'gemini-2.5-flash', isActive: true, isDefault: false, sortOrder: 20, deprecatedAt: null },
      { modelId: 'gemini-2.0-flash', label: 'gemini-2.0-flash', isActive: true, isDefault: false, sortOrder: 30, deprecatedAt: null },
    ],
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

function normalizeModelEntry(input, index = 0) {
  const modelId = sanitizeText(input?.modelId, 120)
  if (!modelId) return null
  return {
    modelId,
    label: sanitizeText(input?.label, 120) || modelId,
    isActive: toBoolean(input?.isActive, true),
    isDefault: toBoolean(input?.isDefault, false),
    sortOrder: toNumber(input?.sortOrder, (index + 1) * 10),
    deprecatedAt: toDateOrNull(input?.deprecatedAt),
  }
}

function ensureProviderModelConsistency(provider) {
  const normalizedModels = []
  const seenModelIds = new Set()

  for (let index = 0; index < (Array.isArray(provider?.models) ? provider.models.length : 0); index += 1) {
    const model = normalizeModelEntry(provider.models[index], index)
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

function getFallbackCatalog() {
  return normalizeCatalogItems(FALLBACK_CATALOG)
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

function findProviderEntry(catalog, providerKey) {
  const key = sanitizeProviderKey(providerKey)
  if (!key) return null
  return (Array.isArray(catalog) ? catalog : []).find((provider) => provider.providerKey === key) || null
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
  const provider = findProviderEntry(catalog, providerKey)
  if (!provider) return false
  const normalizedModel = sanitizeText(modelId, 120)
  if (!normalizedModel) return false
  return provider.models.some((model) => model.modelId === normalizedModel)
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

  const fullCatalog = await listAiProviderCatalog({ includeInactive: true, forceRefresh: true })

  const saved = findProviderEntry(fullCatalog, normalizedProviderKey)
  return { ok: true, status: 200, message: 'AI provider catalog updated', data: toProviderCatalogDto(saved) }
}

module.exports = {
  PROVIDER_KEYS,
  clearAiProviderCatalogCache,
  findProviderEntry,
  getDefaultModelId,
  getDefaultProviderKey,
  isSupportedProviderModel,
  listAiProviderCatalog,
  toProviderCatalogDto,
  upsertAiProviderCatalogEntry,
}
