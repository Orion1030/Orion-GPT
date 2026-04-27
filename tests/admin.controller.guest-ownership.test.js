describe('admin.controller guest ownership rules', () => {
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

  it('inherits guest team from owner when managedByUserId is set', async () => {
    const targetUser = {
      _id: 'guest-1',
      role: 0,
      team: 'Old Team',
      managedByUserId: null,
      memberId: 'GST-1',
      name: 'Guest One',
      email: 'guest@example.com',
    }
    const ownerUser = {
      _id: 'user-1',
      role: 3,
      team: 'Platform',
      isActive: true,
    }
    const updatedUser = {
      _id: 'guest-1',
      memberId: 'GST-1',
      name: 'Guest One',
      email: 'guest@example.com',
      team: 'Platform',
      role: 0,
      isActive: true,
      managedByUserId: 'user-1',
      lastLogin: null,
      createdAt: null,
      updatedAt: null,
      contactNumber: '',
      avatarUrl: '',
      avatarStorageKey: '',
      avatarUpdatedAt: null,
    }

    const findOne = jest
      .fn()
      .mockReturnValueOnce(buildSelectLean(targetUser))
      .mockReturnValueOnce(buildSelectLean(ownerUser))
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValue(buildFindOneAndUpdateLean(updatedUser))

    jest.doMock('../dbModels', () => ({
      UserModel: {
        findOne,
        exists: jest.fn().mockResolvedValue(false),
        findOneAndUpdate,
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
      params: { userId: 'guest-1' },
      body: {
        managedByUserId: 'user-1',
        adminPassword: 'Passw0rd!',
      },
    }
    const res = buildRes()

    await invoke(controller.updateUser, req, res)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'guest-1' },
      { $set: expect.objectContaining({ managedByUserId: 'user-1', team: 'Platform' }) },
      { returnDocument: 'after' }
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('rejects manual team override that conflicts with owner team', async () => {
    const targetUser = {
      _id: 'guest-1',
      role: 0,
      team: 'Old Team',
      managedByUserId: null,
      memberId: 'GST-1',
      name: 'Guest One',
      email: 'guest@example.com',
    }
    const ownerUser = {
      _id: 'user-1',
      role: 3,
      team: 'Platform',
      isActive: true,
    }

    const findOne = jest
      .fn()
      .mockReturnValueOnce(buildSelectLean(targetUser))
      .mockReturnValueOnce(buildSelectLean(ownerUser))

    jest.doMock('../dbModels', () => ({
      UserModel: {
        findOne,
        exists: jest.fn().mockResolvedValue(false),
        findOneAndUpdate: jest.fn(),
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
      params: { userId: 'guest-1' },
      body: {
        managedByUserId: 'user-1',
        team: 'Different Team',
        adminPassword: 'Passw0rd!',
      },
    }
    const res = buildRes()

    await invoke(controller.updateUser, req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('rejects guest ownership assignment when owner role is not Super Admin, Admin, Manager, or User', async () => {
    const targetUser = {
      _id: 'guest-1',
      role: 0,
      team: 'Old Team',
      managedByUserId: null,
      memberId: 'GST-1',
      name: 'Guest One',
      email: 'guest@example.com',
    }
    const guestOwner = {
      _id: 'guest-2',
      role: 0,
      team: 'Platform',
      isActive: true,
    }

    const findOne = jest
      .fn()
      .mockReturnValueOnce(buildSelectLean(targetUser))
      .mockReturnValueOnce(buildSelectLean(guestOwner))

    jest.doMock('../dbModels', () => ({
      UserModel: {
        findOne,
        exists: jest.fn().mockResolvedValue(false),
        findOneAndUpdate: jest.fn(),
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
      params: { userId: 'guest-1' },
      body: {
        managedByUserId: 'guest-2',
      },
    }
    const res = buildRes()

    await invoke(controller.updateUser, req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })
})
