const { chatCompletions } = require('../llm/openaiClient')
const { chatCompletionText } = require('../llm/providerChat.client')
const {
  GENERATE_MODEL,
  GENERATE_MAX_TOKENS,
  GENERATE_MAX_TOKEN_CEILING,
  GENERATE_TIMEOUT_MS,
} = require('../../config/llm')
const {
  buildManagedResumeGenerationSystemPrompt,
  buildResumeGenerationUserPrompt,
} = require('../llm/prompts/resumeGenerate.prompts')
const { resolveManagedPromptContext } = require('../promptRuntime.service')
const { appendPromptAudit } = require('../promptAudit.service')
const {
  AI_RUNTIME_FEATURES,
  resolveFeatureAiRuntimeConfig,
} = require('../adminConfiguration.service')
const { listAiProviderCatalog } = require('../aiProviderCatalog.service')
const {
  REASONING_PROFILES,
} = require('./contracts/constants')
const { getResumeGenerationPipeline } = require('./pipelineRegistry')
const { buildReasoningLockedInstructions } = require('./prompts')
const { getProviderAdapter } = require('./providers')
const { resolveEffectiveResumeGenerationRuntime } = require('./runtime')
const {
  createResumeGenerationRun,
  finalizeResumeGenerationRun,
} = require('./runTelemetry.service')

const RESUME_GENERATION_PROMPT_NAME = 'resume_generation'
const SYSTEM_PROMPT_TYPE = 'system'
const PROMPT_RUNTIME_ACTION = 'prompt_runtime_used'

function toIdString(value, seen = new Set()) {
  if (value == null || value === '') return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)

  if (typeof value === 'object') {
    if (seen.has(value)) return null
    seen.add(value)

    if (typeof value.toHexString === 'function') {
      try {
        const hex = value.toHexString()
        if (hex) return String(hex)
      } catch {}
    }

    const nestedId = value._id ?? value.id
    if (nestedId != null) {
      const nested = toIdString(nestedId, seen)
      if (nested) return nested
    }

    try {
      const asString = value.toString()
      if (asString && asString !== '[object Object]') return String(asString)
    } catch {}
    return null
  }

  try {
    return String(value)
  } catch {
    return null
  }
}

function sanitizePromptSource(source) {
  return String(source || '').trim().slice(0, 80) || 'no_prompt_configured'
}

function sanitizeStr(value) {
  return String(value || '').trim().slice(0, 10000)
}

function buildJsonOnlyPrompt(userPrompt) {
  return `${userPrompt}

## Critical response format:
- Return only a single valid JSON object.
- Do not wrap JSON in markdown fences.
- Do not include explanations or extra text.`
}

function extractJsonObjectFromText(text) {
  const raw = String(text || '').trim()
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {}

  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) return null
  const extracted = raw.slice(firstBrace, lastBrace + 1)

  try {
    return JSON.parse(extracted)
  } catch {
    const repaired = extracted.replace(/,(\s*[}\]])/g, '$1')
    try {
      return JSON.parse(repaired)
    } catch {
      return null
    }
  }
}

function extractStructuredJsonFromChat(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null
  if (!choice?.message?.content) return null
  if (typeof choice.message.content === 'string') {
    try {
      return JSON.parse(choice.message.content)
    } catch {
      return extractJsonObjectFromText(choice.message.content)
    }
  }
  const chunk = choice.message.content.find((c) => typeof c?.text === 'string')
  if (chunk?.text) {
    try {
      return JSON.parse(chunk.text)
    } catch {
      return extractJsonObjectFromText(chunk.text)
    }
  }
  return null
}

function isLikelyTruncatedStructuredResponse(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null
  if (!choice) return false
  if (choice.finish_reason === 'length') return true

  const content = choice?.message?.content
  if (typeof content === 'string') {
    return !content.trim()
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim()
    return !text
  }
  return !content
}

async function appendPromptRuntimeAuditEvent({
  profile,
  resolvedPrompt,
  usedGuardrailedManagedPrompt = false,
  auditContext = {},
} = {}) {
  try {
    if (process.env.NODE_ENV === 'test') return
    const ownerUserId = toIdString(profile?.userId)
    if (!ownerUserId) return
    const scopedProfileId = toIdString(profile?._id)

    await appendPromptAudit({
      ownerUserId,
      actorUserId: auditContext?.actorUserId || null,
      actorType: auditContext?.actorType || 'system',
      action: PROMPT_RUNTIME_ACTION,
      promptId: resolvedPrompt?.promptId || null,
      promptName: RESUME_GENERATION_PROMPT_NAME,
      type: SYSTEM_PROMPT_TYPE,
      profileId: scopedProfileId,
      beforeContext: null,
      afterContext: null,
      payload: {
        resolvedFrom: sanitizePromptSource(resolvedPrompt?.source),
        usedManagedPrompt: Boolean(
          resolvedPrompt?.source &&
            resolvedPrompt.source !== 'fallback_runtime' &&
            resolvedPrompt.source !== 'no_prompt_configured' &&
            resolvedPrompt.promptId
        ),
        usedGuardrailedManagedPrompt: Boolean(usedGuardrailedManagedPrompt),
        resolvedPromptId: resolvedPrompt?.promptId || null,
        resolvedPromptUpdatedAt: resolvedPrompt?.promptUpdatedAt || null,
        jobDescriptionId: auditContext?.jobDescriptionId || null,
        profileId: scopedProfileId || auditContext?.profileId || null,
        baseResumeId: auditContext?.baseResumeId || null,
        applicationId: auditContext?.applicationId || null,
        trigger: auditContext?.trigger || 'resume_generate',
      },
      requestId: auditContext?.requestId || null,
      source: auditContext?.source || 'llm.resume_generation',
      ip: auditContext?.ip || '',
      userAgent: auditContext?.userAgent || '',
    })
  } catch (error) {
    console.warn('[PromptAudit] failed to append runtime usage event', error?.message || error)
  }
}

function buildFallbackResume({ jd, profile, helperSet }) {
  const fallback = helperSet.alignResumeWithProfileCareerHistory(
    helperSet.normalizeResumeJson(helperSet.buildFallbackResume({ jd, profile })),
    profile
  )
  return helperSet.enforceExperienceBullets(fallback, profile, null)
}

async function callChatWithSchema(systemPrompt, userPrompt, maxCompletionTokens, model, runtimeConfig = null) {
  if (runtimeConfig?.useCustom) {
    const providerResult = await chatCompletionText({
      provider: runtimeConfig.provider,
      apiKey: runtimeConfig.apiKey,
      model: runtimeConfig.model || model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildJsonOnlyPrompt(userPrompt) },
      ],
      maxTokens: maxCompletionTokens,
      timeoutMs: GENERATE_TIMEOUT_MS,
      temperature: 0,
      expectJson: true,
    })

    return {
      choices: [
        {
          finish_reason: providerResult?.finishReason || null,
          message: {
            content: providerResult?.text || '',
          },
        },
      ],
      usage: providerResult?.usage || null,
    }
  }

  return chatCompletions({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: maxCompletionTokens,
    timeout_ms: GENERATE_TIMEOUT_MS,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'generate_resume',
        schema: require('../llm/schemas/resumeSchemas').resumeSchema,
        strict: false,
      },
    },
  })
}

async function runLegacyGeneration({
  jd,
  profile,
  baseResume,
  resolvedPrompt,
  runtimeConfig,
  effectiveRuntime,
  helperSet,
}) {
  const llmInput = helperSet.buildResumeGenerationInput({ jd, profile, baseResume })
  const systemPrompt = buildManagedResumeGenerationSystemPrompt(resolvedPrompt?.context || '')
  const userPrompt = buildResumeGenerationUserPrompt(llmInput)

  let rawJson = null
  const maxAttempts = 3
  let maxTokens = Math.max(2000, Number(GENERATE_MAX_TOKENS) || 3000)
  const tokenCeiling = Math.max(maxTokens, Number(GENERATE_MAX_TOKEN_CEILING) || 24000)
  let model = effectiveRuntime?.model || GENERATE_MODEL

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const body = await callChatWithSchema(
        systemPrompt,
        userPrompt,
        maxTokens,
        model,
        runtimeConfig
      )

      rawJson = extractStructuredJsonFromChat(body)
      if (rawJson) break

      if (!isLikelyTruncatedStructuredResponse(body) || attempt >= maxAttempts) {
        break
      }

      const nextMax = Math.min(Math.floor(maxTokens * 1.8), tokenCeiling)
      console.warn(
        `[Generate] empty/length-limited structured output; retrying legacy mode model=${model} max_completion_tokens=${nextMax}`
      )
      maxTokens = nextMax
    }
  } catch (error) {
    console.error('[Generate] legacy resume generation request FAILED')
    console.error('Status:', error?.status)
    console.error('Message:', error?.message)
    console.error('Response:', error?.body || error?.response?.data || error)
    return {
      resume: buildFallbackResume({ jd, profile, helperSet }),
      fallbackReason: 'legacy_generation_failed',
      status: 'fallback',
      usage: null,
    }
  }

  if (!rawJson) {
    console.warn('[Generate] No valid JSON from legacy generator; returning fallback resume')
    return {
      resume: buildFallbackResume({ jd, profile, helperSet }),
      fallbackReason: 'legacy_generation_empty',
      status: 'fallback',
      usage: null,
    }
  }

  const normalized = helperSet.alignResumeWithProfileCareerHistory(
    helperSet.normalizeResumeJson(rawJson),
    profile
  )
  return {
    resume: helperSet.enforceExperienceBullets(normalized, profile, baseResume),
    fallbackReason: null,
    status: 'completed',
    usage: null,
  }
}

async function runReasoningPipeline({
  jd,
  profile,
  baseResume,
  runtimeConfig,
  effectiveRuntime,
  resolvedPrompt,
  helperSet,
}) {
  const adapter = getProviderAdapter(effectiveRuntime.provider)
  const pipeline = getResumeGenerationPipeline(effectiveRuntime.pipelineVersion)
  const stepTimings = {}

  let ctx = {
    jd,
    profile,
    baseResume,
    runtimeConfig,
    effectiveRuntime,
    helperSet,
    adapter,
    reasoningProfile: REASONING_PROFILES.BALANCED,
    lockedInstructions: buildReasoningLockedInstructions(resolvedPrompt?.context || ''),
    artifacts: {},
    usageByStep: {},
    continuationState: null,
    stepTimings,
  }

  for (const step of pipeline) {
    const startedAt = Date.now()
    ctx = await step.run(ctx)
    stepTimings[step.id] = Date.now() - startedAt
  }

  return {
    resume: ctx.artifacts.finalResume,
    fallbackReason: null,
    status: 'completed',
    usage: ctx.usageByStep,
    stepTimings,
  }
}

async function generateResumeFromJD({
  jd,
  profile,
  baseResume,
  auditContext = null,
  helperSet,
}) {
  if (!jd || !profile) throw new Error('JD or profile not found')
  if (!helperSet) throw new Error('Resume generation helperSet is required')

  const scopedOwnerUserId = toIdString(profile?.userId)
  const scopedProfileId = toIdString(profile?._id)
  const resolvedPrompt = await resolveManagedPromptContext({
    ownerId: scopedOwnerUserId,
    profileId: scopedProfileId,
    promptName: RESUME_GENERATION_PROMPT_NAME,
    type: SYSTEM_PROMPT_TYPE,
    fallbackContext: '',
  })

  await appendPromptRuntimeAuditEvent({
    profile,
    resolvedPrompt,
    usedGuardrailedManagedPrompt: true,
    auditContext: auditContext || {},
  })

  const runtimeConfig = await resolveFeatureAiRuntimeConfig({
    targetUserId: scopedOwnerUserId,
    feature: AI_RUNTIME_FEATURES.RESUME_GENERATION,
  })
  const activeCatalog = await listAiProviderCatalog({ includeInactive: false }).catch(() => [])
  const effectiveRuntime = resolveEffectiveResumeGenerationRuntime({
    runtimeConfig,
    catalog: activeCatalog,
  })

  let telemetryRun = null
  try {
    telemetryRun = await createResumeGenerationRun({
      ownerUserId: scopedOwnerUserId,
      actorUserId: auditContext?.actorUserId || null,
      profileId: scopedProfileId,
      baseResumeId: auditContext?.baseResumeId || null,
      applicationId: auditContext?.applicationId || null,
      jobDescriptionId: auditContext?.jobDescriptionId || null,
      configuredMode: effectiveRuntime.configuredMode,
      effectiveMode: effectiveRuntime.effectiveMode,
      pipelineVersion: effectiveRuntime.pipelineVersion,
      provider: effectiveRuntime.provider || (runtimeConfig?.useCustom ? runtimeConfig.provider : 'builtin'),
      model: effectiveRuntime.model || '',
      fallbackReason: effectiveRuntime.fallbackReason,
      meta: {
        source: runtimeConfig?.source || 'builtin',
        useCustomRuntime: Boolean(runtimeConfig?.useCustom),
      },
    })
  } catch (error) {
    console.warn('[ResumeGenerationRun] failed to create run record', error?.message || error)
  }

  try {
    let result = null

    if (effectiveRuntime.effectiveMode === 'reasoning') {
      try {
        result = await runReasoningPipeline({
          jd,
          profile,
          baseResume,
          runtimeConfig,
          effectiveRuntime,
          resolvedPrompt,
          helperSet,
        })
      } catch (error) {
        console.warn(
          `[Generate] reasoning pipeline failed; retrying in legacy mode provider=${effectiveRuntime.provider} model=${effectiveRuntime.model}`,
          error?.message || error
        )

        result = await runLegacyGeneration({
          jd,
          profile,
          baseResume,
          resolvedPrompt,
          runtimeConfig,
          effectiveRuntime: {
            ...effectiveRuntime,
            effectiveMode: 'legacy',
            pipelineVersion: 'legacy-v1',
            model: runtimeConfig?.useCustom ? runtimeConfig.model : GENERATE_MODEL,
          },
          helperSet,
        })

        if (!result.fallbackReason) {
          result.fallbackReason = 'reasoning_pipeline_failed'
          result.status = 'fallback'
        }
      }
    } else {
      result = await runLegacyGeneration({
        jd,
        profile,
        baseResume,
        resolvedPrompt,
        runtimeConfig,
        effectiveRuntime,
        helperSet,
      })
    }

    await finalizeResumeGenerationRun(telemetryRun?._id, {
      status: result?.status || 'completed',
      fallbackReason: result?.fallbackReason || effectiveRuntime.fallbackReason || null,
      stepTimings: result?.stepTimings || null,
      usage: result?.usage || null,
      meta: {
        source: runtimeConfig?.source || 'builtin',
        useCustomRuntime: Boolean(runtimeConfig?.useCustom),
      },
    }).catch((error) => {
      console.warn('[ResumeGenerationRun] failed to finalize run', error?.message || error)
    })

    return result.resume
  } catch (error) {
    console.error('[Generate] unexpected error, returning fallback resume', error)
    const fallback = buildFallbackResume({ jd, profile, helperSet })

    await finalizeResumeGenerationRun(telemetryRun?._id, {
      status: 'fallback',
      fallbackReason: 'unexpected_generation_error',
      usage: null,
      meta: {
        source: runtimeConfig?.source || 'builtin',
        useCustomRuntime: Boolean(runtimeConfig?.useCustom),
      },
    }).catch((finalizeError) => {
      console.warn('[ResumeGenerationRun] failed to finalize fallback run', finalizeError?.message || finalizeError)
    })

    return fallback
  }
}

module.exports = {
  generateResumeFromJD,
}
