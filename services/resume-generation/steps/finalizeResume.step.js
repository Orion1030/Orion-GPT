const { assertObject } = require('./validation')

function validateInput(ctx) {
  assertObject(ctx?.artifacts?.verifiedResume, 'verifiedResume')
}

function validateOutput(output) {
  assertObject(output, 'finalResume')
}

async function run(ctx) {
  validateInput(ctx)
  const finalResume = ctx.artifacts.verifiedResume
  validateOutput(finalResume)
  return {
    ...ctx,
    artifacts: {
      ...ctx.artifacts,
      finalResume,
    },
  }
}

module.exports = {
  id: 'finalize_resume',
  outputArtifactKey: 'finalResume',
  run,
  validateInput,
  validateOutput,
}
