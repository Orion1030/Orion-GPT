const { assertObject } = require('./validation')

function validateInput(ctx) {
  if (!ctx?.jd || !ctx?.profile) {
    throw new Error('normalize_input requires jd and profile')
  }
  if (!ctx?.helperSet?.buildResumeGenerationInput) {
    throw new Error('normalize_input requires helperSet.buildResumeGenerationInput')
  }
}

function validateOutput(output) {
  assertObject(output, 'normalize_input output')
}

async function run(ctx) {
  validateInput(ctx)
  const normalizedInput = ctx.helperSet.buildResumeGenerationInput({
    jd: ctx.jd,
    profile: ctx.profile,
    baseResume: ctx.baseResume,
  })
  validateOutput(normalizedInput)
  return {
    ...ctx,
    artifacts: {
      ...ctx.artifacts,
      normalizedInput,
    },
  }
}

module.exports = {
  id: 'normalize_input',
  outputArtifactKey: 'normalizedInput',
  run,
  validateInput,
  validateOutput,
}
