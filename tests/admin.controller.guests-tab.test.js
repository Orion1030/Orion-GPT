describe('admin.controller guests tab actions', () => {
  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  })

  const invoke = async (handler, req, res) => {
    handler(req, res, jest.fn())
    await new Promise((resolve) => setImmediate(resolve))
  }

  const buildSelectLean = (result) => ({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
    }),
  })

  const buildFindChain = (result) => ({
    select: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
    }),
  })

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('creates a guest owned by the requesting manager', async () => {
    const savedGuest = {
      _id: 'guest-1',
      memberId: 'GST-1',
      name: 'Guest One',
      email: 'guest1@example.com',
      role: 0,
      team: 'Platform',
      isActive: false,
      managedByUserId: 'mgr-1',
      save: jest.fn().mockResolvedValue(null),
    }

    const UserModel = jest.fn().mockImplementation((payload) => ({
      ...savedGuest,
      ...payload,
      save: savedGuest.save,
    }))
    UserModel.findOne = jest
      .fn()
      .mockReturnValueOnce(
        buildSelectLean({
          _id: 'mgr-1',
          role: 2,
          team: 'Platform',
          isActive: true,
        })
      )
      .mockReturnValueOnce(buildSelectLean(null))
      .mockReturnValueOnce(buildSelectLean(null))
    UserModel.find = jest.fn().mockReturnValue(
      buildFindChain([
        {
          _id: 'mgr-1',
          memberId: 'MGR-1',
          name: 'Team Manager',
        },
      ])
    )
    UserModel.exists = jest.fn().mockResolvedValue(false)
    UserModel.findOneAndUpdate = jest.fn()
    UserModel.deleteOne = jest.fn().mockResolvedValue({})

    jest.doMock('../dbModels', () => ({
      TeamModel: {},
      UserModel,
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
      user: { _id: 'mgr-1', role: 2, team: 'Platform' },
      body: {
        name: 'Guest One',
        email: 'guest1@example.com',
        password: 'Passw0rd!',
        confirmPassword: 'Passw0rd!',
      },
    }
    const res = buildRes()

    await invoke(controller.createGuest, req, res)

    expect(UserModel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Guest One',
        email: 'guest1@example.com',
        role: 0,
        isActive: false,
        managedByUserId: 'mgr-1',
        team: 'Platform',
      })
    )
    expect(savedGuest.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('creates a guest owned by the requesting super admin', async () => {
    const savedGuest = {
      _id: 'guest-2',
      memberId: 'GST-2',
      name: 'Guest Two',
      email: 'guest2@example.com',
      role: 0,
      team: 'Executive',
      isActive: false,
      managedByUserId: 'super-1',
      save: jest.fn().mockResolvedValue(null),
    }

    const UserModel = jest.fn().mockImplementation((payload) => ({
      ...savedGuest,
      ...payload,
      save: savedGuest.save,
    }))
    UserModel.findOne = jest
      .fn()
      .mockReturnValueOnce(
        buildSelectLean({
          _id: 'super-1',
          role: 4,
          team: 'Executive',
          isActive: true,
        })
      )
      .mockReturnValueOnce(buildSelectLean(null))
      .mockReturnValueOnce(buildSelectLean(null))
    UserModel.find = jest.fn().mockReturnValue(
      buildFindChain([
        {
          _id: 'super-1',
          memberId: 'SUP-1',
          name: 'Root Admin',
        },
      ])
    )
    UserModel.exists = jest.fn().mockResolvedValue(false)
    UserModel.findOneAndUpdate = jest.fn()
    UserModel.deleteOne = jest.fn().mockResolvedValue({})

    jest.doMock('../dbModels', () => ({
      TeamModel: {},
      UserModel,
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
      user: { _id: 'super-1', role: 4, team: 'Executive' },
      body: {
        name: 'Guest Two',
        email: 'guest2@example.com',
        password: 'Passw0rd!',
        confirmPassword: 'Passw0rd!',
      },
    }
    const res = buildRes()

    await invoke(controller.createGuest, req, res)

    expect(UserModel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Guest Two',
        email: 'guest2@example.com',
        role: 0,
        isActive: false,
        managedByUserId: 'super-1',
        team: 'Executive',
      })
    )
    expect(savedGuest.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('rejects createGuest when requester is not an active Admin/Manager/User', async () => {
    const UserModel = jest.fn()
    UserModel.findOne = jest.fn().mockReturnValue(
      buildSelectLean({
        _id: 'mgr-1',
        role: 2,
        team: 'Platform',
        isActive: false,
      })
    )
    UserModel.find = jest.fn().mockReturnValue(buildFindChain([]))
    UserModel.deleteOne = jest.fn().mockResolvedValue({})
    UserModel.exists = jest.fn().mockResolvedValue(false)
    UserModel.findOneAndUpdate = jest.fn()

    jest.doMock('../dbModels', () => ({
      TeamModel: {},
      UserModel,
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
      user: { _id: 'mgr-1', role: 2, team: 'Platform' },
      body: {
        name: 'Guest One',
        email: 'guest1@example.com',
        password: 'Passw0rd!',
        confirmPassword: 'Passw0rd!',
      },
    }
    const res = buildRes()

    await invoke(controller.createGuest, req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('allows user to delete own guest', async () => {
    const UserModel = jest.fn()
    UserModel.findOne = jest.fn().mockReturnValue(
      buildSelectLean({
        _id: 'guest-1',
        role: 0,
        team: 'Platform',
        managedByUserId: 'user-1',
      })
    )
    UserModel.deleteOne = jest.fn().mockResolvedValue({})
    UserModel.find = jest.fn().mockReturnValue(buildFindChain([]))
    UserModel.exists = jest.fn().mockResolvedValue(false)
    UserModel.findOneAndUpdate = jest.fn()

    jest.doMock('../dbModels', () => ({
      TeamModel: {},
      UserModel,
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
      user: { _id: 'user-1', role: 3, team: 'Platform' },
      params: { guestId: 'guest-1' },
    }
    const res = buildRes()

    await invoke(controller.deleteGuest, req, res)

    expect(UserModel.deleteOne).toHaveBeenCalledWith({ _id: 'guest-1' })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("rejects user deleting another owner's guest", async () => {
    const UserModel = jest.fn()
    UserModel.findOne = jest.fn().mockReturnValue(
      buildSelectLean({
        _id: 'guest-1',
        role: 0,
        team: 'Platform',
        managedByUserId: 'user-2',
      })
    )
    UserModel.deleteOne = jest.fn().mockResolvedValue({})
    UserModel.find = jest.fn().mockReturnValue(buildFindChain([]))
    UserModel.exists = jest.fn().mockResolvedValue(false)
    UserModel.findOneAndUpdate = jest.fn()

    jest.doMock('../dbModels', () => ({
      TeamModel: {},
      UserModel,
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
      user: { _id: 'user-1', role: 3, team: 'Platform' },
      params: { guestId: 'guest-1' },
    }
    const res = buildRes()

    await invoke(controller.deleteGuest, req, res)

    expect(UserModel.deleteOne).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
