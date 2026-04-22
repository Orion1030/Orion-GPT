describe('admin.controller role constraints', () => {
  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  })

  const invoke = async (handler, req, res) => {
    handler(req, res, jest.fn())
    await new Promise((resolve) => setImmediate(resolve))
  }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  function buildSelectLean(result) {
    return {
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
    }
  }

  function buildFindOneAndUpdateLean(result) {
    return {
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
    }
  }

  it('blocks manager role change when target user is assigned as team manager', async () => {
    const targetUser = {
      _id: 'mgr-1',
      role: 2,
      team: 'Platform',
      managedByUserId: null,
      memberId: 'MGR-1',
      name: 'Manager One',
      email: 'mgr@example.com',
    }

    const findOne = jest.fn().mockReturnValueOnce(buildSelectLean(targetUser))
    const exists = jest.fn().mockResolvedValue(true)

    jest.doMock('../dbModels', () => ({
      UserModel: {
        findOne,
        exists: jest.fn().mockResolvedValue(false),
        findOneAndUpdate: jest.fn(),
      },
      TeamModel: {
        exists,
      },
    }))
    jest.doMock('../services/auth.service', () => ({
      verifyRequesterPassword: jest.fn().mockResolvedValue(true),
    }))
    jest.doMock('../realtime/socketServer', () => ({
      getOnlineUserIds: jest.fn().mockReturnValue([]),
      isUserOnline: jest.fn().mockReturnValue(false),
    }))

    const controller = require('../controllers/admin.controller')
    const req = {
      user: { _id: 'admin-1', role: 1, team: 'Platform' },
      params: { userId: 'mgr-1' },
      body: {
        role: 3,
        adminPassword: 'Passw0rd!',
      },
    }
    const res = buildRes()

    await invoke(controller.updateUser, req, res)

    expect(exists).toHaveBeenCalledWith({ managerUserId: 'mgr-1' })
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('allows manager role change once user is no longer assigned as team manager', async () => {
    const targetUser = {
      _id: 'mgr-1',
      role: 2,
      team: 'Platform',
      managedByUserId: null,
      memberId: 'MGR-1',
      name: 'Manager One',
      email: 'mgr@example.com',
    }

    const updatedUser = {
      _id: 'mgr-1',
      memberId: 'MGR-1',
      name: 'Manager One',
      email: 'mgr@example.com',
      team: 'Platform',
      role: 3,
      isActive: true,
      managedByUserId: null,
      lastLogin: null,
      createdAt: null,
      updatedAt: null,
      contactNumber: '',
      avatarUrl: '',
      avatarStorageKey: '',
      avatarUpdatedAt: null,
    }

    const findOne = jest.fn().mockReturnValueOnce(buildSelectLean(targetUser))
    const exists = jest.fn().mockResolvedValue(false)
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValue(buildFindOneAndUpdateLean(updatedUser))

    jest.doMock('../dbModels', () => ({
      UserModel: {
        findOne,
        exists: jest.fn().mockResolvedValue(false),
        findOneAndUpdate,
      },
      TeamModel: {
        exists,
      },
    }))
    const verifyRequesterPassword = jest.fn().mockResolvedValue(true)
    jest.doMock('../services/auth.service', () => ({
      verifyRequesterPassword,
    }))
    jest.doMock('../realtime/socketServer', () => ({
      getOnlineUserIds: jest.fn().mockReturnValue([]),
      isUserOnline: jest.fn().mockReturnValue(false),
    }))

    const controller = require('../controllers/admin.controller')
    const req = {
      user: { _id: 'admin-1', role: 1, team: 'Platform' },
      params: { userId: 'mgr-1' },
      body: {
        role: 3,
      },
    }
    const res = buildRes()

    await invoke(controller.updateUser, req, res)

    expect(exists).toHaveBeenCalledWith({ managerUserId: 'mgr-1' })
    expect(findOneAndUpdate).toHaveBeenCalled()
    expect(verifyRequesterPassword).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })
})
