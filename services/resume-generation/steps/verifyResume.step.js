const { assertArray, assertObject } = require('./validation')

function validateInput(ctx) {
  assertObject(ctx?.artifacts?.resumeDraft, 'resumeDraft')
  if (!ctx?.helperSet?.normalizeResumeJson) {
    throw new Error('verify_resume requires helperSet.normalizeResumeJson')
  }
  if (!ctx?.helperSet?.alignResumeWithProfileCareerHistory) {
    throw new Error('verify_resume requires helperSet.alignResumeWithProfileCareerHistory')
  }
  if (!ctx?.helperSet?.enforceExperienceBullets) {
    throw new Error('verify_resume requires helperSet.enforceExperienceBullets')
  }
  if (ctx.outputMode === 'application_materials' && !ctx?.helperSet?.normalizeCoverLetterJson) {
    throw new Error('verify_resume requires helperSet.normalizeCoverLetterJson')
  }
}

function validateOutput(output) {
  assertObject(output, 'verifiedResume')
  assertArray(output.experiences, 'verifiedResume.experiences')
}

async function run(ctx) {
  validateInput(ctx)
  const normalized = ctx.helperSet.normalizeResumeJson(ctx.artifacts.resumeDraft)
  const aligned = ctx.helperSet.alignResumeWithProfileCareerHistory(normalized, ctx.profile)
  const verifiedResume = ctx.helperSet.enforceExperienceBullets(
    aligned,
    ctx.profile,
    ctx.baseResume
  )
  const verifiedCoverLetter = ctx.outputMode === 'application_materials'
    ? ctx.helperSet.normalizeCoverLetterJson(ctx.artifacts.coverLetterDraft, {
        jd: ctx.jd,
        profile: ctx.profile,
      })
    : null
  validateOutput(verifiedResume)

  return {
    ...ctx,
    artifacts: {
      ...ctx.artifacts,
      verifiedResume,
      ...(verifiedCoverLetter ? { verifiedCoverLetter } : {}),
    },
  }
}

module.exports = {
  id: 'verify_resume',
  outputArtifactKey: 'verifiedResume',
  run,
  validateInput,
  validateOutput,
}
