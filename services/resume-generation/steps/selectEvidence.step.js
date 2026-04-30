const { SelectedEvidenceSchema } = require('../schemas/selectedEvidence.schema')
const { buildSelectEvidencePrompts } = require('../prompts')
const { assertArray, assertObject } = require('./validation')

function validateInput(ctx) {
  assertObject(ctx?.artifacts?.normalizedInput, 'normalizedInput')
  assertObject(ctx?.artifacts?.requirements, 'requirements')
  if (!ctx?.adapter?.generateStructured) {
    throw new Error('select_evidence requires adapter.generateStructured')
  }
}

function validateOutput(output) {
  assertObject(output, 'selectedEvidence')
  assertArray(output.selectedRoles, 'selectedEvidence.selectedRoles')
  assertArray(output.selectedSkills, 'selectedEvidence.selectedSkills')
  assertArray(output.gaps, 'selectedEvidence.gaps')
}

async function run(ctx) {
  validateInput(ctx)
  const prompts = buildSelectEvidencePrompts({
    lockedInstructions: ctx.lockedInstructions,
    normalizedInput: ctx.artifacts.normalizedInput,
    requirements: ctx.artifacts.requirements,
  })

  const response = await ctx.adapter.generateStructured({
    apiKey: ctx.runtimeConfig?.useCustom ? ctx.runtimeConfig.apiKey : undefined,
    model: ctx.effectiveRuntime.model,
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    schemaName: 'resume_selected_evidence',
    schema: SelectedEvidenceSchema,
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
      select_evidence: response?.usage || null,
    },
    artifacts: {
      ...ctx.artifacts,
      selectedEvidence: response.data,
    },
  }
}

module.exports = {
  id: 'select_evidence',
  outputArtifactKey: 'selectedEvidence',
  requiresReasoning: true,
  run,
  validateInput,
  validateOutput,
}
