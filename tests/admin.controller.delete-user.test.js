const { TEST_CREDENTIAL } = require('./helpers/testCredentials')

describe('admin.controller deleteUser', () => {
  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  })

  const invoke = async (handler, req, res) => {
    handler(req, res, jest.fn())
    await new Promise((resolve) => setImmediate(resolve))
  }

  function buildSelectLean(result) {
    return {
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
    }
  }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('permanently deletes a safe user account and owned data for super admin', async () => {
    const targetUser = {
      _id: 'user-1',
      role: 3,
      team: 'Platform',
      managedByUserId: null,
      name: 'Worker One',
      email: 'worker@example.com',
      memberId: 'USR-1',
    }

    const UserModel = {
      findOne: jest.fn().mockReturnValue(buildSelectLean(targetUser)),
      exists: jest.fn().mockResolvedValue(false),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      countDocuments: jest.fn(),
    }

    const TeamModel = {
      exists: jest.fn().mockResolvedValue(false),
    }

    const ProfileModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    }
    const ResumeModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
    }
    const ApplicationModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 3 }),
    }
    const ApplicationEventModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 4 }),
    }
    const ChatSessionModel = {
      find: jest.fn().mockReturnValue(buildSelectLean([{ _id: 'chat-1' }])),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    }
    const ChatMessageModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 5 }),
    }
    const JobDescriptionModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    }
    const JobModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
    }
    const TemplateModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    }
    const PromptModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
    }
    const PromptAuditModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 3 }),
    }
    const NotificationModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 4 }),
    }
    const AdminConfigurationModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    }

    jest.doMock('../dbModels', () => ({
      UserModel,
      TeamModel,
      ProfileModel,
      ResumeModel,
      ApplicationModel,
      ApplicationEventModel,
      ChatSessionModel,
      ChatMessageModel,
      JobDescriptionModel,
      JobModel,
      TemplateModel,
      PromptModel,
      PromptAuditModel,
      NotificationModel,
      AdminConfigurationModel,
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
      params: { userId: 'user-1' },
      body: { adminPassword: TEST_CREDENTIAL },
    }
    const res = buildRes()

    await invoke(controller.deleteUser, req, res)

    expect(TeamModel.exists).toHaveBeenCalledWith({ managerUserId: 'user-1' })
    expect(UserModel.exists).toHaveBeenCalledWith({
      role: 0,
      managedByUserId: 'user-1',
    })
    expect(ChatMessageModel.deleteMany).toHaveBeenCalledWith({
      sessionId: { $in: ['chat-1'] },
    })
    expect(UserModel.deleteOne).toHaveBeenCalledWith({ _id: 'user-1' })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'User permanently deleted',
        data: expect.objectContaining({
          userId: 'user-1',
          deleted: expect.objectContaining({
            profiles: 1,
            resumes: 2,
            applications: 3,
            applicationEvents: 4,
            chatSessions: 1,
            chatMessages: 5,
          }),
        }),
      })
    )
  })

  it('blocks super admin from permanently deleting own account', async () => {
    const UserModel = {
      findOne: jest.fn(),
    }

    jest.doMock('../dbModels', () => ({
      UserModel,
      TeamModel: {},
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
      params: { userId: 'super-1' },
      body: { adminPassword: TEST_CREDENTIAL },
    }
    const res = buildRes()

    await invoke(controller.deleteUser, req, res)

    expect(UserModel.findOne).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('blocks deleting the last super admin account', async () => {
    const targetUser = {
      _id: 'super-2',
      role: 4,
      team: 'Executive',
      managedByUserId: null,
      name: 'Root Admin',
      email: 'root@example.com',
      memberId: 'SUP-2',
    }

    const UserModel = {
      findOne: jest.fn().mockReturnValue(buildSelectLean(targetUser)),
      countDocuments: jest.fn().mockResolvedValue(1),
      exists: jest.fn(),
      deleteOne: jest.fn(),
    }

    jest.doMock('../dbModels', () => ({
      UserModel,
      TeamModel: {},
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
      params: { userId: 'super-2' },
      body: { adminPassword: TEST_CREDENTIAL },
    }
    const res = buildRes()

    await invoke(controller.deleteUser, req, res)

    expect(UserModel.countDocuments).toHaveBeenCalledWith({ role: 4 })
    expect(UserModel.deleteOne).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('blocks deleting a user assigned as team manager', async () => {
    const targetUser = {
      _id: 'mgr-1',
      role: 2,
      team: 'Platform',
      managedByUserId: null,
      name: 'Manager One',
      email: 'manager@example.com',
      memberId: 'MGR-1',
    }

    const UserModel = {
      findOne: jest.fn().mockReturnValue(buildSelectLean(targetUser)),
      exists: jest.fn().mockResolvedValue(false),
      deleteOne: jest.fn(),
      countDocuments: jest.fn(),
    }
    const TeamModel = {
      exists: jest.fn().mockResolvedValue(true),
    }

    jest.doMock('../dbModels', () => ({
      UserModel,
      TeamModel,
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
      params: { userId: 'mgr-1' },
      body: { adminPassword: TEST_CREDENTIAL },
    }
    const res = buildRes()

    await invoke(controller.deleteUser, req, res)

    expect(TeamModel.exists).toHaveBeenCalledWith({ managerUserId: 'mgr-1' })
    expect(UserModel.deleteOne).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('blocks deleting a user who still owns guest accounts', async () => {
    const targetUser = {
      _id: 'user-1',
      role: 3,
      team: 'Platform',
      managedByUserId: null,
      name: 'Worker One',
      email: 'worker@example.com',
      memberId: 'USR-1',
    }

    const UserModel = {
      findOne: jest.fn().mockReturnValue(buildSelectLean(targetUser)),
      exists: jest.fn().mockResolvedValue(true),
      deleteOne: jest.fn(),
      countDocuments: jest.fn(),
    }
    const TeamModel = {
      exists: jest.fn().mockResolvedValue(false),
    }

    jest.doMock('../dbModels', () => ({
      UserModel,
      TeamModel,
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
      params: { userId: 'user-1' },
      body: { adminPassword: TEST_CREDENTIAL },
    }
    const res = buildRes()

    await invoke(controller.deleteUser, req, res)

    expect(UserModel.exists).toHaveBeenCalledWith({
      role: 0,
      managedByUserId: 'user-1',
    })
    expect(UserModel.deleteOne).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })
})
