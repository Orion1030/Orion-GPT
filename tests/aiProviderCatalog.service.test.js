const {
  getModelCapabilities,
  listAiProviderCatalog,
} = require('../services/aiProviderCatalog.service')

describe('aiProviderCatalog.service', () => {
  it('returns fallback capability metadata for supported reasoning models', async () => {
    const catalog = await listAiProviderCatalog({ includeInactive: false, forceRefresh: true })
    const capabilities = getModelCapabilities(catalog, 'openai', 'gpt-5.2-mini')

    expect(capabilities).toEqual(
      expect.objectContaining({
        supportsReasoning: true,
        reasoningControl: 'effort',
        supportsStructuredOutputs: true,
        supportsContinuationState: true,
      })
    )
  })

  it('preserves one default active model per provider in fallback catalog', async () => {
    const catalog = await listAiProviderCatalog({ includeInactive: false, forceRefresh: true })

    for (const provider of catalog) {
      const defaults = (provider.models || []).filter((model) => model.isDefault)
      expect(defaults).toHaveLength(1)
      expect((provider.models || []).some((model) => model.isActive)).toBe(true)
    }
  })
})
