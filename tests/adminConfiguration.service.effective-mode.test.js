const {
  RESUME_GENERATION_MODES,
  resolveEffectiveResumeGenerationMode,
} = require('../services/adminConfiguration.service')

describe('adminConfiguration.service resolveEffectiveResumeGenerationMode', () => {
  it('keeps reasoning mode for builtin reasoning generation', () => {
    expect(
      resolveEffectiveResumeGenerationMode({
        resumeGenerationMode: RESUME_GENERATION_MODES.REASONING,
        useCustom: false,
      })
    ).toBe(RESUME_GENERATION_MODES.REASONING)
  })

  it('keeps reasoning mode for supported custom OpenAI reasoning models', () => {
    expect(
      resolveEffectiveResumeGenerationMode({
        resumeGenerationMode: RESUME_GENERATION_MODES.REASONING,
        useCustom: true,
        provider: 'openai',
        model: 'gpt-5-mini',
      })
    ).toBe(RESUME_GENERATION_MODES.REASONING)
  })

  it('falls back to legacy mode for unsupported custom providers', () => {
    expect(
      resolveEffectiveResumeGenerationMode({
        resumeGenerationMode: RESUME_GENERATION_MODES.REASONING,
        useCustom: true,
        provider: 'claude',
        model: 'claude-sonnet',
      })
    ).toBe(RESUME_GENERATION_MODES.LEGACY)
  })
})
