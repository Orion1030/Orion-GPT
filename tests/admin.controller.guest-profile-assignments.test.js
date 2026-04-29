describe('admin.controller guest profile assignments', () => {
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

  const buildFindSelectSortLean = (result) => ({
    select: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
    }),
  })

  const buildFindSelectLean = (result) => ({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
    }),
  })

  function mockCommonModules({ UserModel, ProfileModel }) {
    jest.doMock('../dbModels', () => ({
      AdminConfigurationModel: { deleteMany: jest.fn() },
      ApplicationEventModel: { deleteMany: jest.fn() },
      ApplicationModel: { deleteMany: jest.fn() },
      ChatMessageModel: { deleteMany: jest.fn() },
      ChatSessionModel: { find: jest.fn().mockReturnValue(buildFindSelectLean([])), deleteMany: jest.fn() },
      JobDescriptionModel: { deleteMany: jest.fn() },
      JobModel: { deleteMany: jest.fn() },
      NotificationModel: { deleteMany: jest.fn() },
      ProfileModel,
      PromptAuditModel: { deleteMany: jest.fn() },
      PromptModel: { deleteMany: jest.fn() },
      ResumeModel: { deleteMany: jest.fn() },
      TeamModel: {},
      TemplateModel: { deleteMany: jest.fn() },
      UserModel,
    }))

    jest.doMock('../services/usageMetrics.service', () => ({
      buildUsageMetricsMap: jest.fn().mockResolvedValue({}),
      createEmptyUsageMetrics: jest.fn().mockReturnValue({}),
    }))
    jest.doMock('../services/auth.service', () => ({
      verifyRequesterPassword: jest.fn().mockResolvedValue(true),
    }))
    jest.doMock('../realtime/socketServer', () => ({
      getOnlineUserIds: jest.fn().mockReturnValue([]),
      isUserOnline: jest.fn().mockReturnValue(false),
    }))
  }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('lists profiles from the current managing account and preserves current assignments', async () => {
    const UserModel = jest.fn()
    UserModel.findOne = jest
      .fn()
      .mockReturnValueOnce(
        buildSelectLean({
          _id: 'guest-1',
          role: 0,
          team: 'Platform',
          managedByUserId: 'user-1',
          assignedProfileIds: ['profile-2'],
        })
      )
      .mockReturnValueOnce(
        buildSelectLean({
          _id: 'user-1',
          name: 'Owner One',
          memberId: 'USR-1',
        })
      )

    const ProfileModel = {
      find: jest
        .fn()
        .mockReturnValueOnce(
          buildFindSelectSortLean([
            {
              _id: 'profile-1',
              fullName: 'Jane Doe',
              title: 'Platform Engineer',
              mainStack: 'Node.js',
              status: 1,
              updatedAt: '2026-04-20T00:00:00.000Z',
            },
            {
              _id: 'profile-2',
              fullName: 'Janet Doe',
              title: 'Backend Engineer',
              mainStack: 'Java',
              status: 0,
              updatedAt: '2026-04-19T00:00:00.000Z',
            },
          ])
        )
        .mockReturnValueOnce(
          buildFindSelectSortLean([
            {
              _id: 'profile-2',
              fullName: 'Janet Doe',
              title: 'Backend Engineer',
              mainStack: 'Java',
              status: 0,
              updatedAt: '2026-04-19T00:00:00.000Z',
            },
          ])
        ),
    }

    mockCommonModules({ UserModel, ProfileModel })

    const controller = require('../controllers/admin.controller')
    const req = {
      user: { _id: 'user-1', role: 3, team: 'Platform' },
      params: { guestId: 'guest-1' },
    }
    const res = buildRes()

    await invoke(controller.getGuestProfileAssignments, req, res)

    expect(ProfileModel.find).toHaveBeenNthCalledWith(1, { userId: 'user-1' })
    expect(ProfileModel.find).toHaveBeenNthCalledWith(2, {
      _id: { $in: ['profile-2'] },
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          ownerUserId: 'user-1',
          profileSourceUserId: 'user-1',
          assignedProfileIds: ['profile-2'],
          profiles: expect.arrayContaining([
            expect.objectContaining({
              id: 'profile-1',
              isAssigned: false,
              status: 'Active',
            }),
            expect.objectContaining({
              id: 'profile-2',
              isAssigned: true,
              status: 'Inactive',
            }),
          ]),
        }),
      })
    )
  })

  it('lists current manager profiles when guest ownership belongs to another user', async () => {
    const UserModel = jest.fn()
    UserModel.findOne = jest
      .fn()
      .mockReturnValueOnce(
        buildSelectLean({
          _id: 'guest-1',
          role: 0,
          team: 'Platform',
          managedByUserId: 'user-1',
          assignedProfileIds: ['profile-9'],
        })
      )
      .mockReturnValueOnce(
        buildSelectLean({
          _id: 'user-1',
          name: 'Owner User',
          memberId: 'USR-1',
        })
      )
      .mockReturnValueOnce(
        buildSelectLean({
          _id: 'mgr-1',
          name: 'Manager One',
          memberId: 'MGR-1',
        })
      )

    const ProfileModel = {
      find: jest
        .fn()
        .mockReturnValueOnce(
          buildFindSelectSortLean([
            {
              _id: 'profile-1',
              fullName: 'Manager Profile',
              title: 'Delivery Manager',
              mainStack: 'Operations',
              status: 1,
              updatedAt: '2026-04-21T00:00:00.000Z',
            },
          ])
        )
        .mockReturnValueOnce(
          buildFindSelectSortLean([
            {
              _id: 'profile-9',
              fullName: 'Existing Assigned',
              title: 'Platform Analyst',
              mainStack: 'BI',
              status: 1,
              updatedAt: '2026-04-18T00:00:00.000Z',
            },
          ])
        ),
    }

    mockCommonModules({ UserModel, ProfileModel })

    const controller = require('../controllers/admin.controller')
    const req = {
      user: { _id: 'mgr-1', role: 2, team: 'Platform' },
      params: { guestId: 'guest-1' },
    }
    const res = buildRes()

    await invoke(controller.getGuestProfileAssignments, req, res)

    expect(ProfileModel.find).toHaveBeenNthCalledWith(1, { userId: 'mgr-1' })
    expect(ProfileModel.find).toHaveBeenNthCalledWith(2, {
      _id: { $in: ['profile-9'] },
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          ownerUserId: 'user-1',
          profileSourceUserId: 'mgr-1',
          assignedProfileIds: ['profile-9'],
          profiles: expect.arrayContaining([
            expect.objectContaining({ id: 'profile-1', isAssigned: false }),
            expect.objectContaining({ id: 'profile-9', isAssigned: true }),
          ]),
        }),
      })
    )
  })

  it('updates guest profile assignments when all selected profiles belong to the current managing account', async () => {
    const UserModel = jest.fn()
    UserModel.findOne = jest.fn().mockReturnValue(
      buildSelectLean({
        _id: 'guest-1',
        role: 0,
        team: 'Platform',
        managedByUserId: 'user-1',
        assignedProfileIds: [],
      })
    )
    UserModel.findOneAndUpdate = jest.fn().mockReturnValue(
      buildSelectLean({
        _id: 'guest-1',
        assignedProfileIds: ['profile-1', 'profile-2'],
      })
    )

    const ProfileModel = {
      find: jest.fn().mockReturnValue(
        buildFindSelectLean([{ _id: 'profile-1' }, { _id: 'profile-2' }])
      ),
    }

    mockCommonModules({ UserModel, ProfileModel })

    const controller = require('../controllers/admin.controller')
    const req = {
      user: { _id: 'user-1', role: 3, team: 'Platform' },
      params: { guestId: 'guest-1' },
      body: { assignedProfileIds: ['profile-1', 'profile-2'] },
    }
    const res = buildRes()

    await invoke(controller.updateGuestProfileAssignments, req, res)

    expect(ProfileModel.find).toHaveBeenCalledWith({
      _id: { $in: ['profile-1', 'profile-2'] },
      userId: 'user-1',
    })
    expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'guest-1' },
      { $set: { assignedProfileIds: ['profile-1', 'profile-2'] } },
      { returnDocument: 'after' }
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('allows a manager to add their own profile while keeping an existing assigned profile', async () => {
    const UserModel = jest.fn()
    UserModel.findOne = jest.fn().mockReturnValue(
      buildSelectLean({
        _id: 'guest-1',
        role: 0,
        team: 'Platform',
        managedByUserId: 'user-1',
        assignedProfileIds: ['profile-9'],
      })
    )
    UserModel.findOneAndUpdate = jest.fn().mockReturnValue(
      buildSelectLean({
        _id: 'guest-1',
        assignedProfileIds: ['profile-9', 'profile-1'],
      })
    )

    const ProfileModel = {
      find: jest
        .fn()
        .mockReturnValueOnce(buildFindSelectLean([{ _id: 'profile-1' }]))
        .mockReturnValueOnce(buildFindSelectLean([{ _id: 'profile-9' }])),
    }

    mockCommonModules({ UserModel, ProfileModel })

    const controller = require('../controllers/admin.controller')
    const req = {
      user: { _id: 'mgr-1', role: 2, team: 'Platform' },
      params: { guestId: 'guest-1' },
      body: { assignedProfileIds: ['profile-9', 'profile-1'] },
    }
    const res = buildRes()

    await invoke(controller.updateGuestProfileAssignments, req, res)

    expect(ProfileModel.find).toHaveBeenNthCalledWith(1, {
      _id: { $in: ['profile-9', 'profile-1'] },
      userId: 'mgr-1',
    })
    expect(ProfileModel.find).toHaveBeenNthCalledWith(2, {
      _id: { $in: ['profile-9'] },
    })
    expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'guest-1' },
      { $set: { assignedProfileIds: ['profile-9', 'profile-1'] } },
      { returnDocument: 'after' }
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('rejects assignments that are outside the current managing account scope', async () => {
    const UserModel = jest.fn()
    UserModel.findOne = jest.fn().mockReturnValue(
      buildSelectLean({
        _id: 'guest-1',
        role: 0,
        team: 'Platform',
        managedByUserId: 'user-1',
        assignedProfileIds: [],
      })
    )
    UserModel.findOneAndUpdate = jest.fn()

    const ProfileModel = {
      find: jest.fn().mockReturnValue(buildFindSelectLean([{ _id: 'profile-1' }])),
    }

    mockCommonModules({ UserModel, ProfileModel })

    const controller = require('../controllers/admin.controller')
    const req = {
      user: { _id: 'user-1', role: 3, team: 'Platform' },
      params: { guestId: 'guest-1' },
      body: { assignedProfileIds: ['profile-1', 'profile-9'] },
    }
    const res = buildRes()

    await invoke(controller.updateGuestProfileAssignments, req, res)

    expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Assigned profiles must come from your account or already be assigned to this guest',
      })
    )
  })
})
