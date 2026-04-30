const {
  GENERATE_MODEL,
  GENERATE_REASONING_MODEL,
} = require('../../config/llm')
const { getModelCapabilities } = require('../aiProviderCatalog.service')
const { getPipelineVersionForMode } = require('./contracts/constants')
const { getProviderAdapter } = require('./providers')

function sanitizeProvider(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'claude' || normalized === 'gemini') return normalized
  return 'openai'
}

function sanitizeModel(value) {
  return String(value || '').trim().slice(0, 120)
}

function getBuiltinResumeProvider() {
  return 'openai'
}

function getBuiltinResumeModel(mode) {
  return String(mode || '').trim().toLowerCase() === 'reasoning'
    ? GENERATE_REASONING_MODEL
    : (GENERATE_MODEL || GENERATE_REASONING_MODEL)
}

function resolveReasoningSupport({
  catalog = [],
  provider,
  model,
} = {}) {
  const normalizedProvider = sanitizeProvider(provider)
  const normalizedModel = sanitizeModel(model)
  const capabilities = getModelCapabilities(catalog, normalizedProvider, normalizedModel)
  const adapter = getProviderAdapter(normalizedProvider)

  if (!normalizedModel) {
    return {
      supported: false,
      reason: 'missing_model',
      capabilities,
      provider: normalizedProvider,
      model: normalizedModel,
    }
  }

  if (!capabilities.supportsReasoning) {
    return {
      supported: false,
      reason: 'model_reasoning_unsupported',
      capabilities,
      provider: normalizedProvider,
      model: normalizedModel,
    }
  }

  if (!capabilities.supportsStructuredOutputs) {
    return {
      supported: false,
      reason: 'structured_outputs_unsupported',
      capabilities,
      provider: normalizedProvider,
      model: normalizedModel,
    }
  }

  if (!adapter.supportsReasoningModel({ model: normalizedModel, capabilities })) {
    return {
      supported: false,
      reason: 'provider_reasoning_not_enabled',
      capabilities,
      provider: normalizedProvider,
      model: normalizedModel,
    }
  }

  return {
    supported: true,
    reason: null,
    capabilities,
    provider: normalizedProvider,
    model: normalizedModel,
  }
}

function resolveEffectiveResumeGenerationRuntime({
  runtimeConfig = {},
  catalog = [],
} = {}) {
  const configuredMode =
    String(runtimeConfig?.resumeGenerationMode || '').trim().toLowerCase() === 'reasoning'
      ? 'reasoning'
      : 'legacy'

  const useCustomRuntime = Boolean(runtimeConfig?.useCustom)
  const provider = useCustomRuntime
    ? sanitizeProvider(runtimeConfig?.provider)
    : getBuiltinResumeProvider()
  const model = useCustomRuntime
    ? sanitizeModel(runtimeConfig?.model)
    : getBuiltinResumeModel(configuredMode)

  if (configuredMode !== 'reasoning') {
    return {
      configuredMode,
      effectiveMode: 'legacy',
      supportsReasoning: false,
      fallbackReason: null,
      provider,
      model,
      pipelineVersion: getPipelineVersionForMode('legacy'),
    }
  }

  const support = resolveReasoningSupport({ catalog, provider, model })
  const fallbackReason = support.supported
    ? null
    : sanitizeModel(runtimeConfig?.reason) || support.reason

  return {
    configuredMode,
    effectiveMode: support.supported ? 'reasoning' : 'legacy',
    supportsReasoning: Boolean(support.supported),
    fallbackReason,
    provider: support.provider,
    model: support.model,
    pipelineVersion: getPipelineVersionForMode(support.supported ? 'reasoning' : 'legacy'),
  }
}

module.exports = {
  getBuiltinResumeModel,
  getBuiltinResumeProvider,
  resolveEffectiveResumeGenerationRuntime,
  resolveReasoningSupport,
}
