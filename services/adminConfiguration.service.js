const { RoleLevels } = require('../utils/constants')
const { normalizeTeamName, toIdString, toRoleNumber } = require('../utils/managementScope')
const { decryptSecret, encryptSecret } = require('../utils/secretCrypto')
const {
  findProviderEntry,
  getDefaultModelId,
  getDefaultProviderKey,
  isSupportedProviderModel,
  listAiProviderCatalog,
} = require('./aiProviderCatalog.service')

const AI_RUNTIME_FEATURES = {
  RESUME_GENERATION: 'resume_generation',
  AI_CHAT: 'ai_chat',
}

const RESUME_GENERATION_MODES = {
  LEGACY: 'legacy',
  REASONING: 'reasoning',
}

const AI_FEATURE_FIELD_MAP = {
  [AI_RUNTIME_FEATURES.RESUME_GENERATION]: 'useForResumeGeneration',
  [AI_RUNTIME_FEATURES.AI_CHAT]: 'useForAiChat',
}

function shouldUseDatabase() {
  return process.env.NODE_ENV !== 'test'
}

function getModels() {
  if (!shouldUseDatabase()) return null
  try {
    return require('../dbModels')
  } catch (error) {
    console.warn('[AdminConfiguration] unable to load db models', error?.message || error)
    return null
  }
}

function getAdminConfigurationModel() {
  return getModels()?.AdminConfigurationModel || null
}

function getUserModel() {
  return getModels()?.UserModel || null
}

function getTeamModel() {
  return getModels()?.TeamModel || null
}

async function getActiveProviderCatalog() {
  return listAiProviderCatalog({ includeInactive: false })
}

function normalizeAiProvider(value, catalog = []) {
  const normalized = String(value || '').trim().toLowerCase()
  if (findProviderEntry(catalog, normalized)) return normalized
  return getDefaultProviderKey(catalog)
}

function sanitizeModel(value) {
  return String(value || '').trim().slice(0, 120)
}

function normalizeResumeGenerationMode(value, fallback = RESUME_GENERATION_MODES.LEGACY) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === RESUME_GENERATION_MODES.REASONING) {
    return RESUME_GENERATION_MODES.REASONING
  }
  if (normalized === RESUME_GENERATION_MODES.LEGACY) {
    return RESUME_GENERATION_MODES.LEGACY
  }
  return fallback
}

function resolveProviderModel(model, provider, catalog = []) {
  const normalizedModel = sanitizeModel(model)
  if (normalizedModel && isSupportedProviderModel(catalog, provider, normalizedModel)) {
    return normalizedModel
  }
  return getDefaultModelId(catalog, provider)
}

function sanitizeApiKey(value) {
  return String(value || '').trim().slice(0, 3000)
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

function isManagementConfigRole(role) {
  const normalized = toRoleNumber(role)
  return (
    normalized === RoleLevels.SUPER_ADMIN ||
    normalized === RoleLevels.ADMIN ||
    normalized === RoleLevels.Manager
  )
}

function maskApiKey(value) {
  const key = sanitizeApiKey(value)
  if (!key) return ''
  if (key.length <= 8) return `${'*'.repeat(Math.max(0, key.length - 2))}${key.slice(-2)}`
  return `${key.slice(0, 4)}${'*'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`
}

function buildDefaultPublicConfig() {
  const defaultProvider = 'openai'
  return {
    aiProvider: defaultProvider,
    model: '',
    isCustomAiEnabled: false,
    useForResumeGeneration: false,
    resumeGenerationMode: RESUME_GENERATION_MODES.LEGACY,
    useForAiChat: false,
    hasApiKey: false,
    maskedApiKey: '',
    updatedAt: null,
    createdAt: null,
  }
}

function toPublicConfig(configDoc, catalog = []) {
  if (!configDoc) {
    const defaults = buildDefaultPublicConfig()
    const provider = getDefaultProviderKey(catalog)
    defaults.aiProvider = provider
    defaults.model = getDefaultModelId(catalog, provider)
    return defaults
  }
  let decryptedApiKey = ''
  try {
    decryptedApiKey = sanitizeApiKey(decryptSecret(configDoc.encryptedApiKey))
  } catch (error) {
    console.warn(
      '[AdminConfiguration] failed to decrypt saved api key for public config',
      error?.message || error
    )
  }

  const provider = normalizeAiProvider(configDoc.aiProvider, catalog)
  const model = resolveProviderModel(configDoc.model, provider, catalog)

  return {
    aiProvider: provider,
    model,
    isCustomAiEnabled: configDoc?.isCustomAiEnabled !== false,
    useForResumeGeneration: Boolean(configDoc.useForResumeGeneration),
    resumeGenerationMode: normalizeResumeGenerationMode(
      configDoc?.resumeGenerationMode,
      RESUME_GENERATION_MODES.LEGACY
    ),
    useForAiChat: Boolean(configDoc.useForAiChat),
    hasApiKey: Boolean(decryptedApiKey),
    maskedApiKey: decryptedApiKey ? maskApiKey(decryptedApiKey) : '',
    updatedAt: configDoc.updatedAt || null,
    createdAt: configDoc.createdAt || null,
  }
}

function validateUpsertPayload(payload = {}) {
  const errors = []
  const normalized = {
    aiProvider: String(payload.aiProvider || '').trim().toLowerCase(),
    model: sanitizeModel(payload.model),
    apiKey: sanitizeApiKey(payload.apiKey),
    clearApiKey: toBoolean(payload.clearApiKey, false),
    isCustomAiEnabled: toBoolean(payload.isCustomAiEnabled, false),
    useForResumeGeneration: toBoolean(payload.useForResumeGeneration, false),
    resumeGenerationMode: normalizeResumeGenerationMode(
      payload.resumeGenerationMode,
      RESUME_GENERATION_MODES.LEGACY
    ),
    useForAiChat: toBoolean(payload.useForAiChat, false),
  }

  if (payload.model !== undefined && !normalized.model) {
    errors.push('model cannot be empty when provided')
  }
  if (
    payload.resumeGenerationMode !== undefined &&
    normalized.resumeGenerationMode !== String(payload.resumeGenerationMode || '').trim().toLowerCase()
  ) {
    errors.push('resumeGenerationMode must be one of: legacy, reasoning')
  }

  return { normalized, errors }
}

async function getAiConfigurationForOwner(ownerUserId) {
  const normalizedOwnerId = toIdString(ownerUserId)
  const catalog = await getActiveProviderCatalog()
  if (!normalizedOwnerId) return toPublicConfig(null, catalog)

  const AdminConfigurationModel = getAdminConfigurationModel()
  if (!AdminConfigurationModel) return toPublicConfig(null, catalog)

  const config = await AdminConfigurationModel.findOne({ ownerUserId: normalizedOwnerId })
    .select(
      'ownerUserId aiProvider model encryptedApiKey isCustomAiEnabled useForResumeGeneration resumeGenerationMode useForAiChat createdAt updatedAt'
    )
    .lean()
  return toPublicConfig(config, catalog)
}

async function upsertAiConfigurationForOwner({ ownerUserId, actorUserId, payload = {} } = {}) {
  const normalizedOwnerId = toIdString(ownerUserId)
  const normalizedActorId = toIdString(actorUserId)
  if (!normalizedOwnerId) {
    return { ok: false, status: 400, message: 'ownerUserId is required', data: null }
  }

  const UserModel = getUserModel()
  const AdminConfigurationModel = getAdminConfigurationModel()
  if (!UserModel || !AdminConfigurationModel) {
    return { ok: false, status: 500, message: 'Admin configuration store is unavailable', data: null }
  }

  const owner = await UserModel.findOne({ _id: normalizedOwnerId })
    .select('_id role isActive')
    .lean()
  if (!owner) {
    return { ok: false, status: 404, message: 'Owner user not found', data: null }
  }
  if (!isManagementConfigRole(owner.role)) {
    return {
      ok: false,
      status: 403,
      message: 'Only super admin, admin, or manager accounts can configure AI runtime settings',
      data: null,
    }
  }
  if (!owner.isActive) {
    return { ok: false, status: 403, message: 'Owner account must be active', data: null }
  }

  const validation = validateUpsertPayload(payload)
  if (validation.errors.length) {
    return { ok: false, status: 400, message: validation.errors[0], data: null }
  }
  const catalog = await getActiveProviderCatalog()
  if (!catalog.length) {
    return {
      ok: false,
      status: 500,
      message: 'No active AI providers configured. Ask super admin to configure AI provider catalog.',
      data: null,
    }
  }

  const existing = await AdminConfigurationModel.findOne({ ownerUserId: normalizedOwnerId }).lean()
  const nextProvider = payload.aiProvider !== undefined
    ? normalizeAiProvider(validation.normalized.aiProvider, catalog)
    : normalizeAiProvider(existing?.aiProvider, catalog)

  if (payload.aiProvider !== undefined && !findProviderEntry(catalog, validation.normalized.aiProvider)) {
    const allowed = catalog.map((provider) => provider.providerKey).join(', ')
    return {
      ok: false,
      status: 400,
      message: `aiProvider must be one of active providers: ${allowed}`,
      data: null,
    }
  }

  const requestedModel = payload.model !== undefined
    ? validation.normalized.model
    : ''
  const existingModel = sanitizeModel(existing?.model)
  const nextModel = requestedModel
    ? requestedModel
    : resolveProviderModel(existingModel, nextProvider, catalog)
  const nextIsCustomAiEnabled = payload.isCustomAiEnabled !== undefined
    ? validation.normalized.isCustomAiEnabled
    : existing
      ? existing?.isCustomAiEnabled !== false
      : true
  const nextUseForResumeGeneration = payload.useForResumeGeneration !== undefined
    ? validation.normalized.useForResumeGeneration
    : Boolean(existing?.useForResumeGeneration)
  const nextResumeGenerationMode = payload.resumeGenerationMode !== undefined
    ? validation.normalized.resumeGenerationMode
    : normalizeResumeGenerationMode(
        existing?.resumeGenerationMode,
        RESUME_GENERATION_MODES.LEGACY
      )
  const nextUseForAiChat = payload.useForAiChat !== undefined
    ? validation.normalized.useForAiChat
    : Boolean(existing?.useForAiChat)

  let nextEncryptedApiKey = String(existing?.encryptedApiKey || '').trim()
  if (validation.normalized.clearApiKey) {
    nextEncryptedApiKey = ''
  }
  if (payload.apiKey !== undefined) {
    if (validation.normalized.apiKey) {
      try {
        nextEncryptedApiKey = encryptSecret(validation.normalized.apiKey)
      } catch (error) {
        return {
          ok: false,
          status: 500,
          message: error?.message || 'Failed to encrypt api key',
          data: null,
        }
      }
    } else if (validation.normalized.clearApiKey) {
      nextEncryptedApiKey = ''
    }
  }

  let hasApiKey = false
  try {
    hasApiKey = Boolean(sanitizeApiKey(decryptSecret(nextEncryptedApiKey)))
  } catch (error) {
    return {
      ok: false,
      status: 500,
      message: error?.message || 'Failed to decrypt api key for validation',
      data: null,
    }
  }
  if (nextIsCustomAiEnabled && (nextUseForResumeGeneration || nextUseForAiChat) && !hasApiKey) {
    return {
      ok: false,
      status: 400,
      message: 'API key is required before enabling custom AI runtime usage',
      data: null,
    }
  }
  if (nextIsCustomAiEnabled && (nextUseForResumeGeneration || nextUseForAiChat) && !nextModel) {
    return {
      ok: false,
      status: 400,
      message: 'model is required before enabling custom AI runtime usage',
      data: null,
    }
  }
  if (nextModel && !isSupportedProviderModel(catalog, nextProvider, nextModel)) {
    const allowed = (findProviderEntry(catalog, nextProvider)?.models || [])
      .map((model) => model.modelId)
      .join(', ')
    return {
      ok: false,
      status: 400,
      message: `model must be one of provider-supported values: ${allowed}`,
      data: null,
    }
  }

  await AdminConfigurationModel.findOneAndUpdate(
    { ownerUserId: normalizedOwnerId },
    {
      $set: {
        aiProvider: nextProvider,
        model: nextModel,
        encryptedApiKey: nextEncryptedApiKey,
        isCustomAiEnabled: nextIsCustomAiEnabled,
        useForResumeGeneration: nextUseForResumeGeneration,
        resumeGenerationMode: nextResumeGenerationMode,
        useForAiChat: nextUseForAiChat,
        updatedByUserId: normalizedActorId || normalizedOwnerId,
      },
      $setOnInsert: {
        ownerUserId: normalizedOwnerId,
      },
    },
    { upsert: true, returnDocument: 'after' }
  )

  const saved = await AdminConfigurationModel.findOne({ ownerUserId: normalizedOwnerId })
    .select(
      'ownerUserId aiProvider model encryptedApiKey isCustomAiEnabled useForResumeGeneration resumeGenerationMode useForAiChat createdAt updatedAt'
    )
    .lean()

  return { ok: true, status: 200, message: 'AI runtime settings updated', data: toPublicConfig(saved, catalog) }
}

async function resolveTeamManagerUserId(teamName) {
  if (!teamName) return ''
  const TeamModel = getTeamModel()
  if (!TeamModel) return ''

  const team = await TeamModel.findOne({ name: teamName })
    .select('managerUserId')
    .lean()
  return toIdString(team?.managerUserId)
}

async function resolveSuperAdminUserId() {
  const UserModel = getUserModel()
  if (!UserModel) return ''
  const superAdmin = await UserModel.findOne({
    role: RoleLevels.SUPER_ADMIN,
    isActive: true,
  })
    .select('_id')
    .sort({ createdAt: 1, _id: 1 })
    .lean()
  return toIdString(superAdmin?._id)
}

async function buildOwnerCandidateIds(targetUser) {
  const candidates = []
  const addCandidate = (value) => {
    const id = toIdString(value)
    if (!id || candidates.includes(id)) return
    candidates.push(id)
  }

  const targetRole = toRoleNumber(targetUser?.role)
  if (isManagementConfigRole(targetRole)) {
    addCandidate(targetUser?._id)
  }

  if (targetRole === RoleLevels.GUEST) {
    addCandidate(targetUser?.managedByUserId)
  }

  const normalizedTeam = normalizeTeamName(targetUser?.team)
  if (normalizedTeam) {
    addCandidate(await resolveTeamManagerUserId(normalizedTeam))
  }

  addCandidate(await resolveSuperAdminUserId())
  return candidates
}

function buildDisabledRuntimeResult({
  feature,
  reason = 'no_custom_ai_configuration',
  resumeGenerationMode = RESUME_GENERATION_MODES.LEGACY,
} = {}) {
  return {
    useCustom: false,
    feature,
    reason,
    source: 'builtin',
    ownerUserId: null,
    provider: null,
    model: null,
    apiKey: null,
    resumeGenerationMode: normalizeResumeGenerationMode(
      resumeGenerationMode,
      RESUME_GENERATION_MODES.LEGACY
    ),
  }
}

function getFeatureFieldName(feature) {
  return AI_FEATURE_FIELD_MAP[feature] || ''
}

function supportsOpenAiReasoningModel(model) {
  const normalized = sanitizeModel(model).toLowerCase()
  if (!normalized) return false
  return /^gpt-5(?:[.-]|$)/.test(normalized) || /^o[134](?:[.-]|$)/.test(normalized)
}

function resolveEffectiveResumeGenerationMode(runtimeConfig = {}) {
  const configuredMode = normalizeResumeGenerationMode(
    runtimeConfig?.resumeGenerationMode,
    RESUME_GENERATION_MODES.LEGACY
  )

  if (configuredMode !== RESUME_GENERATION_MODES.REASONING) {
    return RESUME_GENERATION_MODES.LEGACY
  }

  if (!runtimeConfig?.useCustom) {
    return RESUME_GENERATION_MODES.REASONING
  }

  if (runtimeConfig?.provider !== 'openai') {
    return RESUME_GENERATION_MODES.LEGACY
  }

  return supportsOpenAiReasoningModel(runtimeConfig?.model)
    ? RESUME_GENERATION_MODES.REASONING
    : RESUME_GENERATION_MODES.LEGACY
}

async function resolveFeatureAiRuntimeConfig({ targetUserId, feature } = {}) {
  const normalizedTargetUserId = toIdString(targetUserId)
  const featureField = getFeatureFieldName(feature)
  if (!normalizedTargetUserId || !featureField) {
    return buildDisabledRuntimeResult({ feature, reason: 'invalid_runtime_target' })
  }

  const UserModel = getUserModel()
  const AdminConfigurationModel = getAdminConfigurationModel()
  if (!UserModel || !AdminConfigurationModel) {
    return buildDisabledRuntimeResult({ feature, reason: 'configuration_store_unavailable' })
  }

  const catalog = await getActiveProviderCatalog()
  if (!catalog.length) {
    return buildDisabledRuntimeResult({ feature, reason: 'no_active_provider_catalog' })
  }

  const targetUser = await UserModel.findOne({ _id: normalizedTargetUserId })
    .select('_id role team managedByUserId isActive')
    .lean()
  if (!targetUser || !targetUser.isActive) {
    return buildDisabledRuntimeResult({ feature, reason: 'target_user_not_available' })
  }

  const candidateOwnerIds = await buildOwnerCandidateIds(targetUser)
  if (!candidateOwnerIds.length) {
    return buildDisabledRuntimeResult({ feature, reason: 'no_owner_candidates' })
  }

  const configs = await AdminConfigurationModel.find({
    ownerUserId: { $in: candidateOwnerIds },
  })
    .select(
      'ownerUserId aiProvider model encryptedApiKey isCustomAiEnabled useForResumeGeneration resumeGenerationMode useForAiChat updatedAt'
    )
    .lean()
  const byOwnerId = new Map(
    configs.map((config) => [toIdString(config.ownerUserId), config])
  )
  let resolvedResumeGenerationMode = RESUME_GENERATION_MODES.LEGACY

  for (const ownerId of candidateOwnerIds) {
    const config = byOwnerId.get(ownerId)
    if (!config) continue
    resolvedResumeGenerationMode = normalizeResumeGenerationMode(
      config?.resumeGenerationMode,
      resolvedResumeGenerationMode
    )
    const isCustomAiEnabled = config?.isCustomAiEnabled !== false
    if (!isCustomAiEnabled) continue
    if (!Boolean(config[featureField])) continue

    let decryptedKey = ''
    try {
      decryptedKey = sanitizeApiKey(decryptSecret(config.encryptedApiKey))
    } catch (error) {
      console.warn(
        '[AdminConfiguration] failed to decrypt configured api key',
        error?.message || error
      )
      continue
    }

    const provider = normalizeAiProvider(config.aiProvider, catalog)
    const model = resolveProviderModel(config.model, provider, catalog)
    if (!decryptedKey || !model) continue
    if (!isSupportedProviderModel(catalog, provider, model)) continue

    return {
      useCustom: true,
      feature,
      reason: null,
      source: 'admin_configuration',
      ownerUserId: ownerId,
      provider,
      model,
      apiKey: decryptedKey,
      resumeGenerationMode: normalizeResumeGenerationMode(
        config?.resumeGenerationMode,
        RESUME_GENERATION_MODES.LEGACY
      ),
      updatedAt: config.updatedAt || null,
    }
  }

  return buildDisabledRuntimeResult({
    feature,
    reason: 'custom_configuration_not_enabled',
    resumeGenerationMode: resolvedResumeGenerationMode,
  })
}

async function resolveEffectiveResumeGenerationStatus({ targetUserId } = {}) {
  const normalizedTargetUserId = toIdString(targetUserId)
  const runtimeConfig = await resolveFeatureAiRuntimeConfig({
    targetUserId: normalizedTargetUserId,
    feature: AI_RUNTIME_FEATURES.RESUME_GENERATION,
  })
  const configuredResumeGenerationMode = normalizeResumeGenerationMode(
    runtimeConfig?.resumeGenerationMode,
    RESUME_GENERATION_MODES.LEGACY
  )
  const effectiveResumeGenerationMode = resolveEffectiveResumeGenerationMode(
    runtimeConfig
  )

  return {
    targetUserId: normalizedTargetUserId || null,
    configuredResumeGenerationMode,
    effectiveResumeGenerationMode,
    fallsBackToLegacy:
      configuredResumeGenerationMode === RESUME_GENERATION_MODES.REASONING &&
      effectiveResumeGenerationMode !== configuredResumeGenerationMode,
    source: runtimeConfig?.source || 'builtin',
    useCustomRuntime: Boolean(runtimeConfig?.useCustom),
    provider: runtimeConfig?.provider || null,
    model: runtimeConfig?.model || null,
    reason: runtimeConfig?.reason || null,
  }
}

module.exports = {
  AI_RUNTIME_FEATURES,
  RESUME_GENERATION_MODES,
  getAiConfigurationForOwner,
  isManagementConfigRole,
  resolveEffectiveResumeGenerationMode,
  resolveEffectiveResumeGenerationStatus,
  resolveFeatureAiRuntimeConfig,
  upsertAiConfigurationForOwner,
}
