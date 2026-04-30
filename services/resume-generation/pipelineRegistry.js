const normalizeInputStep = require('./steps/normalizeInput.step')
const extractRequirementsStep = require('./steps/extractRequirements.step')
const selectEvidenceStep = require('./steps/selectEvidence.step')
const buildStrategyStep = require('./steps/buildStrategy.step')
const draftResumeStep = require('./steps/draftResume.step')
const verifyResumeStep = require('./steps/verifyResume.step')
const finalizeResumeStep = require('./steps/finalizeResume.step')

function getResumeGenerationPipeline(version) {
  if (String(version || '').trim().toLowerCase() !== 'reasoning-v1') {
    return []
  }

  return [
    normalizeInputStep,
    extractRequirementsStep,
    selectEvidenceStep,
    buildStrategyStep,
    draftResumeStep,
    verifyResumeStep,
    finalizeResumeStep,
  ]
}

module.exports = {
  getResumeGenerationPipeline,
}
