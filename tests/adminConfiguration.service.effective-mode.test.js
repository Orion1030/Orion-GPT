const {
  RESUME_GENERATION_MODES,
  isManagementConfigRole,
  resolveEffectiveResumeGenerationMode,
} = require('../services/adminConfiguration.service')
const { RoleLevels } = require('../utils/constants')

describe('adminConfiguration.service role access', () => {
  it('allows user accounts to own AI runtime configuration', () => {
    expect(isManagementConfigRole(RoleLevels.User)).toBe(true)
  })

  it('keeps guest accounts on inherited runtime configuration', () => {
    expect(isManagementConfigRole(RoleLevels.GUEST)).toBe(false)
  })
})

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
        model: 'gpt-5.2-mini',
      })
    ).toBe(RESUME_GENERATION_MODES.REASONING)
  })

  it('keeps builtin reasoning mode even when custom catalog is unavailable', () => {
    expect(
      resolveEffectiveResumeGenerationMode({
        resumeGenerationMode: RESUME_GENERATION_MODES.REASONING,
        useCustom: false,
        reason: 'no_active_provider_catalog',
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
