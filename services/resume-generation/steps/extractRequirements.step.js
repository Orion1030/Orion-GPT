const { assertArray, assertObject } = require('./validation')

function dedupeStrings(items) {
  const out = []
  const seen = new Set()
  for (const item of Array.isArray(items) ? items : []) {
    const clean = String(item || '').trim()
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
  }
  return out
}

function validateInput(ctx) {
  assertObject(ctx?.artifacts?.normalizedInput, 'normalizedInput')
}

function validateOutput(output) {
  assertObject(output, 'extract_requirements output')
  assertArray(output.priorityKeywords, 'extract_requirements.priorityKeywords')
}

async function run(ctx) {
  validateInput(ctx)
  const jobDescription = ctx.artifacts.normalizedInput.jobDescription || {}
  const priorityKeywords = dedupeStrings([
    ...(jobDescription.skills || []),
    ...(jobDescription.requirements || []).slice(0, 12),
    ...(jobDescription.responsibilities || []).slice(0, 12),
  ]).slice(0, 30)

  const requirements = {
    targetTitle: String(jobDescription.title || '').trim(),
    priorityKeywords,
    responsibilities: dedupeStrings(jobDescription.responsibilities || []).slice(0, 15),
    requirements: dedupeStrings(jobDescription.requirements || []).slice(0, 15),
    niceToHave: dedupeStrings(jobDescription.niceToHave || []).slice(0, 10),
  }
  validateOutput(requirements)
  return {
    ...ctx,
    artifacts: {
      ...ctx.artifacts,
      requirements,
    },
  }
}

module.exports = {
  id: 'extract_requirements',
  outputArtifactKey: 'requirements',
  run,
  validateInput,
  validateOutput,
}
