describe('promptRuntime.service resolution chain', () => {
  const originalNodeEnv = process.env.NODE_ENV

  function createLeanChain(result) {
    return {
      sort() {
        return this
      },
      select() {
        return this
      },
      lean: jest.fn().mockResolvedValue(result),
    }
  }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NODE_ENV = 'development'
    delete process.env.SUPER_ADMIN_PROMPT_OWNER_ID
    delete process.env.BASE_PROMPT_OWNER_ID
  })

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('uses profile override first when present', async () => {
    const promptFindOne = jest
      .fn()
      .mockImplementationOnce(() =>
        createLeanChain({
          _id: 'profile-prompt-id',
          context: 'profile-level prompt',
          updatedAt: '2026-04-20T00:00:00.000Z',
        })
      )
    const userFindOne = jest.fn()

    jest.doMock('../dbModels', () => ({
      PromptModel: { findOne: promptFindOne },
      UserModel: { findOne: userFindOne },
    }))

    const runtime = require('../services/promptRuntime.service')
    const resolved = await runtime.resolveManagedPromptContext({
      ownerId: 'owner-1',
      profileId: 'profile-1',
      promptName: 'resume_generation',
      type: 'system',
      fallbackContext: '',
    })

    expect(resolved.source).toBe('profile_override')
    expect(resolved.context).toBe('profile-level prompt')
    expect(promptFindOne).toHaveBeenCalledTimes(1)
    expect(userFindOne).not.toHaveBeenCalled()
  })

  it('falls back to owner account default when no profile override exists', async () => {
    const promptFindOne = jest
      .fn()
      .mockImplementationOnce(() => createLeanChain(null))
      .mockImplementationOnce(() =>
        createLeanChain({
          _id: 'account-prompt-id',
          context: 'account default prompt',
          updatedAt: '2026-04-20T00:00:00.000Z',
        })
      )
    const userFindOne = jest.fn()

    jest.doMock('../dbModels', () => ({
      PromptModel: { findOne: promptFindOne },
      UserModel: { findOne: userFindOne },
    }))

    const runtime = require('../services/promptRuntime.service')
    const resolved = await runtime.resolveManagedPromptContext({
      ownerId: 'owner-1',
      profileId: 'profile-1',
      promptName: 'resume_generation',
      type: 'system',
      fallbackContext: '',
    })

    expect(resolved.source).toBe('account_default')
    expect(resolved.context).toBe('account default prompt')
    expect(promptFindOne).toHaveBeenCalledTimes(2)
    expect(userFindOne).not.toHaveBeenCalled()
  })

  it('falls back to super admin base prompt when owner prompt is missing', async () => {
    const promptFindOne = jest
      .fn()
      .mockImplementationOnce(() => createLeanChain(null))
      .mockImplementationOnce(() =>
        createLeanChain({
          _id: 'base-prompt-id',
          context: 'super admin base prompt',
          updatedAt: '2026-04-20T00:00:00.000Z',
        })
      )
    const userFindOne = jest.fn().mockImplementation(() =>
      createLeanChain({
        _id: 'super-admin-owner-id',
      })
    )

    jest.doMock('../dbModels', () => ({
      PromptModel: { findOne: promptFindOne },
      UserModel: { findOne: userFindOne },
    }))

    const runtime = require('../services/promptRuntime.service')
    const resolved = await runtime.resolveManagedPromptContext({
      ownerId: 'owner-1',
      profileId: null,
      promptName: 'resume_generation',
      type: 'system',
      fallbackContext: '',
    })

    expect(resolved.source).toBe('super_admin_base')
    expect(resolved.context).toBe('super admin base prompt')
    expect(userFindOne).toHaveBeenCalledTimes(1)
    expect(promptFindOne).toHaveBeenCalledTimes(2)
    expect(promptFindOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        owner: 'owner-1',
      })
    )
    expect(promptFindOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        owner: 'super-admin-owner-id',
      })
    )
  })

  it('returns no_prompt_configured when no managed prompt is found', async () => {
    const promptFindOne = jest
      .fn()
      .mockImplementationOnce(() => createLeanChain(null))
    const userFindOne = jest.fn().mockImplementation(() => createLeanChain(null))

    jest.doMock('../dbModels', () => ({
      PromptModel: { findOne: promptFindOne },
      UserModel: { findOne: userFindOne },
    }))

    const runtime = require('../services/promptRuntime.service')
    const resolved = await runtime.resolveManagedPromptContext({
      ownerId: 'owner-1',
      profileId: null,
      promptName: 'resume_generation',
      type: 'system',
      fallbackContext: '',
    })

    expect(resolved.source).toBe('no_prompt_configured')
    expect(resolved.context).toBe('')
  })
})
