const { ResumeStrategySchema } = require('../schemas/resumeStrategy.schema')
const { buildStrategyPrompts } = require('../prompts')
const { assertArray, assertObject } = require('./validation')

function validateInput(ctx) {
  assertObject(ctx?.artifacts?.normalizedInput, 'normalizedInput')
  assertObject(ctx?.artifacts?.requirements, 'requirements')
  assertObject(ctx?.artifacts?.selectedEvidence, 'selectedEvidence')
  if (!ctx?.adapter?.generateStructured) {
    throw new Error('build_strategy requires adapter.generateStructured')
  }
}

function validateOutput(output) {
  assertObject(output, 'resumeStrategy')
  assertArray(output.summaryFocus, 'resumeStrategy.summaryFocus')
  assertArray(output.skillPriorities, 'resumeStrategy.skillPriorities')
  assertArray(output.experiencePlan, 'resumeStrategy.experiencePlan')
  assertArray(output.notes, 'resumeStrategy.notes')
}

async function run(ctx) {
  validateInput(ctx)
  const prompts = buildStrategyPrompts({
    lockedInstructions: ctx.lockedInstructions,
    normalizedInput: ctx.artifacts.normalizedInput,
    requirements: ctx.artifacts.requirements,
    selectedEvidence: ctx.artifacts.selectedEvidence,
  })

  const response = await ctx.adapter.generateStructured({
    apiKey: ctx.runtimeConfig?.useCustom ? ctx.runtimeConfig.apiKey : undefined,
    model: ctx.effectiveRuntime.model,
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    schemaName: 'resume_strategy',
    schema: ResumeStrategySchema,
    maxOutputTokens: 3500,
    reasoningProfile: ctx.reasoningProfile,
    continuationState: ctx.continuationState || null,
  })

  validateOutput(response?.data)

  return {
    ...ctx,
    continuationState: response?.continuationState || ctx.continuationState || null,
    usageByStep: {
      ...ctx.usageByStep,
      build_strategy: response?.usage || null,
    },
    artifacts: {
      ...ctx.artifacts,
      resumeStrategy: response.data,
    },
  }
}

module.exports = {
  id: 'build_strategy',
  outputArtifactKey: 'resumeStrategy',
  requiresReasoning: true,
  run,
  validateInput,
  validateOutput,
}
