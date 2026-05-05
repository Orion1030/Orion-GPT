describe('adminConfiguration.controller getMyEffectiveResumeGenerationMode', () => {
  let getMyEffectiveResumeGenerationMode
  let resolveEffectiveResumeGenerationStatusMock
  let isAdminUserMock

  const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  })

  async function invokeController(controller, req, res) {
    controller(req, res, jest.fn())
    await new Promise((resolve) => setImmediate(resolve))
  }

  beforeEach(() => {
    jest.resetModules()

    resolveEffectiveResumeGenerationStatusMock = jest.fn()
    isAdminUserMock = jest.fn().mockReturnValue(false)

    jest.doMock('../services/adminConfiguration.service', () => ({
      getAiConfigurationForOwner: jest.fn(),
      resolveEffectiveResumeGenerationStatus: resolveEffectiveResumeGenerationStatusMock,
      upsertAiConfigurationForOwner: jest.fn(),
    }))
    jest.doMock('../services/aiProviderCatalog.service', () => ({
      listAiProviderCatalog: jest.fn(),
      toProviderCatalogDto: jest.fn(),
      upsertAiProviderCatalogEntry: jest.fn(),
    }))
    jest.doMock('../utils/access', () => ({
      isAdminUser: isAdminUserMock,
    }))

    ;({ getMyEffectiveResumeGenerationMode } = require('../controllers/adminConfiguration.controller'))
  })

  it('returns the effective mode for the signed-in user by default', async () => {
    resolveEffectiveResumeGenerationStatusMock.mockResolvedValue({
      targetUserId: 'user-1',
      configuredResumeGenerationMode: 'legacy',
      effectiveResumeGenerationMode: 'legacy',
      fallsBackToLegacy: false,
      source: 'builtin',
      useCustomRuntime: false,
      provider: null,
      model: null,
      reason: null,
    })

    const req = {
      user: { _id: 'user-1', role: 3 },
      query: {},
    }
    const res = makeResponse()

    await invokeController(getMyEffectiveResumeGenerationMode, req, res)

    expect(resolveEffectiveResumeGenerationStatusMock).toHaveBeenCalledWith({
      targetUserId: 'user-1',
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          targetUserId: 'user-1',
          effectiveResumeGenerationMode: 'legacy',
        }),
      })
    )
  })

  it('allows admin users to inspect the effective mode for a selected target user', async () => {
    isAdminUserMock.mockReturnValue(true)
    resolveEffectiveResumeGenerationStatusMock.mockResolvedValue({
      targetUserId: 'user-9',
      configuredResumeGenerationMode: 'reasoning',
      effectiveResumeGenerationMode: 'legacy',
      fallsBackToLegacy: true,
      source: 'admin_configuration',
      useCustomRuntime: true,
      provider: 'claude',
      model: 'claude-sonnet',
      reason: null,
    })

    const req = {
      user: { _id: 'admin-1', role: 1 },
      query: { targetUserId: 'user-9' },
    }
    const res = makeResponse()

    await invokeController(getMyEffectiveResumeGenerationMode, req, res)

    expect(resolveEffectiveResumeGenerationStatusMock).toHaveBeenCalledWith({
      targetUserId: 'user-9',
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          targetUserId: 'user-9',
          configuredResumeGenerationMode: 'reasoning',
          effectiveResumeGenerationMode: 'legacy',
          fallsBackToLegacy: true,
        }),
      })
    )
  })
})
