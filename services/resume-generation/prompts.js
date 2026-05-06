function sanitizePromptSection(value, maxLen = 100000) {
  return String(value || '').trim().slice(0, maxLen)
}

function buildReasoningLockedInstructions(managedPrompt) {
  const customInstructions = sanitizePromptSection(managedPrompt, 100000)

  return `Locked constraints:
- Use only grounded facts from the provided input artifacts.
- Never invent employers, titles, dates, education, tools, ownership, or metrics.
- Preserve timeline consistency across all roles.
- Prefer omission when evidence is weak or ambiguous.
- Return valid JSON only for the requested schema.

Custom instructions:
${customInstructions || 'No custom instructions configured. Optimize for strong JD alignment, factual accuracy, and concise ATS-friendly wording.'}`
}

function buildSelectEvidencePrompts({ lockedInstructions, normalizedInput, requirements }) {
  return {
    systemPrompt: `You are selecting the strongest candidate evidence for a tailored resume.
${lockedInstructions}

Select only the roles and skills that best support the target job. Prefer direct candidate evidence over broad company context.`,
    userPrompt: `Return JSON only.

Artifacts:
${JSON.stringify({ normalizedInput, requirements }, null, 2)}`,
  }
}

function buildStrategyPrompts({ lockedInstructions, normalizedInput, requirements, selectedEvidence }) {
  return {
    systemPrompt: `You are building a resume strategy from grounded evidence.
${lockedInstructions}

Produce a concise plan for summary focus, skill emphasis, and role emphasis before drafting the resume.`,
    userPrompt: `Return JSON only.

Artifacts:
${JSON.stringify({ normalizedInput, requirements, selectedEvidence }, null, 2)}`,
  }
}

function buildDraftPrompts({
  lockedInstructions,
  normalizedInput,
  requirements,
  selectedEvidence,
  resumeStrategy,
  outputMode = 'resume',
}) {
  const includesCoverLetter = outputMode === 'application_materials'
  const task = includesCoverLetter
    ? 'You are drafting final paired application materials JSON from a grounded resume strategy.'
    : 'You are drafting the final resume JSON from a grounded resume strategy.'
  const outputInstructions = includesCoverLetter
    ? 'Return a single JSON object with `resume` and `coverLetter`. The cover letter must be tailored to the same job description and use the same grounded evidence as the resume.'
    : 'Return the resume JSON only.'
  return {
    systemPrompt: `${task}
${lockedInstructions}

Use selected evidence as the primary source for claims. Keep the output ATS-friendly, specific, and natural.
${outputInstructions}`,
    userPrompt: `Return JSON only.

Artifacts:
${JSON.stringify(
  {
    normalizedInput,
    requirements,
    selectedEvidence,
    resumeStrategy,
  },
  null,
  2
)}`,
  }
}

module.exports = {
  buildDraftPrompts,
  buildReasoningLockedInstructions,
  buildSelectEvidencePrompts,
  buildStrategyPrompts,
}
