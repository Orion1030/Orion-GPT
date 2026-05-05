function shouldUseDatabase() {
  return process.env.NODE_ENV !== 'test'
}

let cachedModel = undefined

function sanitizeText(value, maxLen = 200) {
  return String(value || '').trim().slice(0, maxLen)
}

function toIdString(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') {
      try {
        return String(value.toHexString())
      } catch {}
    }
    if (value._id != null) return toIdString(value._id)
    if (value.id != null) return toIdString(value.id)
  }
  try {
    return String(value)
  } catch {
    return null
  }
}

function getResumeGenerationRunModel() {
  if (cachedModel !== undefined) return cachedModel
  if (!shouldUseDatabase()) {
    cachedModel = null
    return cachedModel
  }
  try {
    cachedModel = require('../../dbModels').ResumeGenerationRunModel || null
  } catch (error) {
    console.warn('[ResumeGenerationRun] failed to resolve model', error?.message || error)
    cachedModel = null
  }
  return cachedModel
}

async function createResumeGenerationRun({
  ownerUserId = null,
  actorUserId = null,
  profileId = null,
  baseResumeId = null,
  applicationId = null,
  jobDescriptionId = null,
  configuredMode = 'legacy',
  effectiveMode = 'legacy',
  pipelineVersion = 'legacy-v1',
  provider = 'builtin',
  model = '',
  fallbackReason = null,
  meta = null,
} = {}) {
  const ResumeGenerationRunModel = getResumeGenerationRunModel()
  if (!ResumeGenerationRunModel) return null

  return ResumeGenerationRunModel.create({
    ownerUserId: toIdString(ownerUserId),
    actorUserId: toIdString(actorUserId),
    profileId: toIdString(profileId),
    baseResumeId: toIdString(baseResumeId),
    applicationId: toIdString(applicationId),
    jobDescriptionId: toIdString(jobDescriptionId),
    configuredMode,
    effectiveMode,
    pipelineVersion,
    provider: sanitizeText(provider, 30) || 'builtin',
    model: sanitizeText(model, 120),
    status: 'running',
    fallbackReason: sanitizeText(fallbackReason, 200) || null,
    stepTimings: {},
    usage: null,
    meta: meta && typeof meta === 'object' ? meta : null,
  })
}

async function finalizeResumeGenerationRun(runId, {
  status = 'completed',
  fallbackReason = null,
  stepTimings = null,
  usage = null,
  meta = null,
} = {}) {
  const ResumeGenerationRunModel = getResumeGenerationRunModel()
  const normalizedRunId = toIdString(runId)
  if (!ResumeGenerationRunModel || !normalizedRunId) return null

  const update = {
    status: sanitizeText(status, 40) || 'completed',
    fallbackReason: sanitizeText(fallbackReason, 200) || null,
  }
  if (stepTimings && typeof stepTimings === 'object') update.stepTimings = stepTimings
  if (usage !== undefined) update.usage = usage
  if (meta !== undefined) update.meta = meta

  return ResumeGenerationRunModel.findOneAndUpdate(
    { _id: normalizedRunId },
    { $set: update },
    { returnDocument: 'after' }
  )
}

module.exports = {
  createResumeGenerationRun,
  finalizeResumeGenerationRun,
}
