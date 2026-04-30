const { ResumeDraftSchema } = require('../schemas/resumeDraft.schema')
const { buildDraftPrompts } = require('../prompts')
const { assertArray, assertObject } = require('./validation')

function validateInput(ctx) {
  assertObject(ctx?.artifacts?.normalizedInput, 'normalizedInput')
  assertObject(ctx?.artifacts?.requirements, 'requirements')
  assertObject(ctx?.artifacts?.selectedEvidence, 'selectedEvidence')
  assertObject(ctx?.artifacts?.resumeStrategy, 'resumeStrategy')
  if (!ctx?.adapter?.generateStructured) {
    throw new Error('draft_resume requires adapter.generateStructured')
  }
}

function validateOutput(output) {
  assertObject(output, 'resumeDraft')
  assertArray(output.experiences, 'resumeDraft.experiences')
  assertArray(output.skills, 'resumeDraft.skills')
  assertArray(output.education, 'resumeDraft.education')
}

async function run(ctx) {
  validateInput(ctx)
  const prompts = buildDraftPrompts({
    lockedInstructions: ctx.lockedInstructions,
    normalizedInput: ctx.artifacts.normalizedInput,
    requirements: ctx.artifacts.requirements,
    selectedEvidence: ctx.artifacts.selectedEvidence,
    resumeStrategy: ctx.artifacts.resumeStrategy,
  })

  const response = await ctx.adapter.generateStructured({
    apiKey: ctx.runtimeConfig?.useCustom ? ctx.runtimeConfig.apiKey : undefined,
    model: ctx.effectiveRuntime.model,
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    schemaName: 'resume_draft',
    schema: ResumeDraftSchema,
    maxOutputTokens: 12000,
    reasoningProfile: ctx.reasoningProfile,
    continuationState: ctx.continuationState || null,
  })

  validateOutput(response?.data)

  return {
    ...ctx,
    continuationState: response?.continuationState || ctx.continuationState || null,
    usageByStep: {
      ...ctx.usageByStep,
      draft_resume: response?.usage || null,
    },
    artifacts: {
      ...ctx.artifacts,
      resumeDraft: response.data,
    },
  }
}

module.exports = {
  id: 'draft_resume',
  outputArtifactKey: 'resumeDraft',
  requiresReasoning: true,
  run,
  validateInput,
  validateOutput,
}
