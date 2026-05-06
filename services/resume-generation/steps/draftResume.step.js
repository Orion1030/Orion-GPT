const { ResumeDraftSchema } = require('../schemas/resumeDraft.schema')
const { ApplicationMaterialsSchema } = require('../schemas/applicationMaterials.schema')
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

function validateResumeDraft(output, label = 'resumeDraft') {
  assertObject(output, label)
  assertArray(output.experiences, `${label}.experiences`)
  assertArray(output.skills, `${label}.skills`)
  assertArray(output.education, `${label}.education`)
}

function validateOutput(output, outputMode = 'resume') {
  if (outputMode === 'application_materials') {
    assertObject(output, 'applicationMaterials')
    validateResumeDraft(output.resume, 'applicationMaterials.resume')
    assertObject(output.coverLetter, 'applicationMaterials.coverLetter')
    assertArray(output.coverLetter.bodyParagraphs, 'applicationMaterials.coverLetter.bodyParagraphs')
    return
  }
  validateResumeDraft(output, 'resumeDraft')
}

async function run(ctx) {
  validateInput(ctx)
  const prompts = buildDraftPrompts({
    lockedInstructions: ctx.lockedInstructions,
    normalizedInput: ctx.artifacts.normalizedInput,
    requirements: ctx.artifacts.requirements,
    selectedEvidence: ctx.artifacts.selectedEvidence,
    resumeStrategy: ctx.artifacts.resumeStrategy,
    outputMode: ctx.outputMode,
  })
  const isApplicationMaterials = ctx.outputMode === 'application_materials'

  const response = await ctx.adapter.generateStructured({
    apiKey: ctx.runtimeConfig?.useCustom ? ctx.runtimeConfig.apiKey : undefined,
    model: ctx.effectiveRuntime.model,
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    schemaName: isApplicationMaterials ? 'application_materials' : 'resume_draft',
    schema: isApplicationMaterials ? ApplicationMaterialsSchema : ResumeDraftSchema,
    maxOutputTokens: 12000,
    reasoningProfile: ctx.reasoningProfile,
    continuationState: ctx.continuationState || null,
  })

  validateOutput(response?.data, ctx.outputMode)
  const resumeDraft = isApplicationMaterials ? response.data.resume : response.data
  const coverLetterDraft = isApplicationMaterials ? response.data.coverLetter : null

  return {
    ...ctx,
    continuationState: response?.continuationState || ctx.continuationState || null,
    usageByStep: {
      ...ctx.usageByStep,
      draft_resume: response?.usage || null,
    },
    artifacts: {
      ...ctx.artifacts,
      resumeDraft,
      ...(coverLetterDraft ? { coverLetterDraft } : {}),
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
