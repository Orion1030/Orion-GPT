const RESUME_GENERATION_PIPELINE_VERSIONS = Object.freeze({
  LEGACY_V1: 'legacy-v1',
  REASONING_V1: 'reasoning-v1',
})

const REASONING_PROFILES = Object.freeze({
  BALANCED: 'balanced',
})

function getPipelineVersionForMode(mode) {
  return String(mode || '').trim().toLowerCase() === 'reasoning'
    ? RESUME_GENERATION_PIPELINE_VERSIONS.REASONING_V1
    : RESUME_GENERATION_PIPELINE_VERSIONS.LEGACY_V1
}

module.exports = {
  REASONING_PROFILES,
  RESUME_GENERATION_PIPELINE_VERSIONS,
  getPipelineVersionForMode,
}
