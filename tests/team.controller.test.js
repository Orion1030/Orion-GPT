const { TEST_CREDENTIAL } = require('./helpers/testCredentials')

describe('team.controller', () => {
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

  function buildLeanChain(result) {
    return {
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
      lean: jest.fn().mockResolvedValue(result),
    }
  }

  it('listTeams scopes manager to own team', async () => {
    const teamRows = [
      {
        _id: 'team-1',
        name: 'Platform',
        teamKey: 'PLATFORM',
        description: '',
        managerUserId: null,
        isActive: true,
      },
    ]

    const TeamModel = {
      find: jest.fn().mockReturnValue(buildLeanChain(teamRows)),
    }
    const UserModel = {
      aggregate: jest.fn().mockResolvedValue([{ _id: 'Platform', count: 2 }]),
      find: jest.fn().mockReturnValue(buildLeanChain([])),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: {
        _id: 'mgr-1',
        role: 2,
        team: 'Platform',
      },
    }
    const res = buildRes()

    await invoke(controller.listTeams, req, res)

    expect(TeamModel.find).toHaveBeenCalledWith({ name: 'Platform' })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('createTeam rejects non-super-admin actor', async () => {
    const TeamModel = {
      find: jest.fn(),
    }
    const UserModel = {
      findOne: jest.fn(),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'admin-1', role: 1, team: 'Platform' },
      body: { name: 'Platform' },
    }
    const res = buildRes()

    await invoke(controller.createTeam, req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('updateTeam renames existing team and syncs user team field', async () => {
    const savedTeam = {
      _id: 'team-1',
      name: 'Platform',
      teamKey: 'PLATFORM',
      description: '',
      managerUserId: null,
      isActive: true,
      save: jest.fn().mockResolvedValue(null),
    }

    const TeamModel = {
      findOne: jest.fn().mockResolvedValue(savedTeam),
    }
    const UserModel = {
      updateMany: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([{ _id: 'Platform Core', count: 5 }]),
      find: jest.fn().mockReturnValue(buildLeanChain([])),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'admin-1', role: 1 },
      params: { teamId: 'team-1' },
      body: { name: 'Platform Core' },
    }
    const res = buildRes()

    await invoke(controller.updateTeam, req, res)

    expect(savedTeam.save).toHaveBeenCalled()
    expect(UserModel.updateMany).toHaveBeenCalledWith(
      { team: 'Platform' },
      { $set: { team: 'Platform Core' } }
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('allows manager to update own team description', async () => {
    const savedTeam = {
      _id: 'team-1',
      name: 'Platform',
      teamKey: 'PLATFORM',
      description: 'Old description',
      managerUserId: null,
      isActive: true,
      save: jest.fn().mockResolvedValue(null),
    }

    const TeamModel = {
      findOne: jest.fn().mockResolvedValue(savedTeam),
    }
    const UserModel = {
      updateMany: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([{ _id: 'Platform', count: 2 }]),
      find: jest.fn().mockReturnValue(buildLeanChain([])),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'mgr-1', role: 2, team: 'Platform' },
      params: { teamId: 'team-1' },
      body: { description: 'Updated team charter' },
    }
    const res = buildRes()

    await invoke(controller.updateTeam, req, res)

    expect(savedTeam.save).toHaveBeenCalled()
    expect(savedTeam.description).toBe('Updated team charter')
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('rejects manager updating another team', async () => {
    const savedTeam = {
      _id: 'team-2',
      name: 'Data',
      teamKey: 'DATA',
      description: 'Data team',
      managerUserId: null,
      isActive: true,
      save: jest.fn().mockResolvedValue(null),
    }

    const TeamModel = {
      findOne: jest.fn().mockResolvedValue(savedTeam),
    }
    const UserModel = {
      updateMany: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([{ _id: 'Data', count: 2 }]),
      find: jest.fn().mockReturnValue(buildLeanChain([])),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'mgr-1', role: 2, team: 'Platform' },
      params: { teamId: 'team-2' },
      body: { description: 'Should fail' },
    }
    const res = buildRes()

    await invoke(controller.updateTeam, req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('allows admin to add users to team and sync guest team by ownership', async () => {
    const TeamModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'team-1',
        name: 'Platform',
      }),
    }
    const UserModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'user-1', role: 3, team: '', isActive: true },
            { _id: 'user-2', role: 3, team: 'Data', isActive: true },
          ]),
        }),
      }),
      updateMany: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([]),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'admin-1', role: 1 },
      params: { teamId: 'team-1' },
      body: { userIds: ['user-1', 'user-2'] },
    }
    const res = buildRes()

    await invoke(controller.addTeamMembers, req, res)

    expect(UserModel.updateMany).toHaveBeenNthCalledWith(
      1,
      { _id: { $in: ['user-1', 'user-2'] } },
      { $set: { team: 'Platform' } }
    )
    expect(UserModel.updateMany).toHaveBeenNthCalledWith(
      2,
      { role: 0, managedByUserId: { $in: ['user-1', 'user-2'] } },
      { $set: { team: 'Platform' } }
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('rejects manager adding users from other teams', async () => {
    const TeamModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'team-1',
        name: 'Platform',
      }),
    }
    const UserModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'user-1', role: 3, team: 'Data', isActive: true },
          ]),
        }),
      }),
      updateMany: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([]),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'mgr-1', role: 2, team: 'Platform' },
      params: { teamId: 'team-1' },
      body: { userIds: ['user-1'] },
    }
    const res = buildRes()

    await invoke(controller.addTeamMembers, req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('lists current members for a team', async () => {
    const TeamModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'team-1',
        name: 'Platform',
      }),
    }
    const UserModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                _id: 'user-1',
                memberId: 'M-001',
                name: 'Alice',
                team: 'Platform',
                role: 3,
                isActive: true,
                lastLogin: null,
              },
            ]),
          }),
        }),
      }),
      updateMany: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([]),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'admin-1', role: 1 },
      params: { teamId: 'team-1' },
    }
    const res = buildRes()

    await invoke(controller.listTeamMembers, req, res)

    expect(UserModel.find).toHaveBeenCalledWith({
      role: { $in: [1, 2, 3] },
      team: 'Platform',
    })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('removes member from team and clears owned guest team', async () => {
    const TeamModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'team-1',
        name: 'Platform',
        managerUserId: null,
        save: jest.fn().mockResolvedValue(null),
      }),
    }
    const UserModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ _id: 'user-1', role: 3, team: 'Platform' }),
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockReturnValue(buildLeanChain([])),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'mgr-1', role: 2, team: 'Platform' },
      params: { teamId: 'team-1', userId: 'user-1' },
    }
    const res = buildRes()

    await invoke(controller.removeTeamMember, req, res)

    expect(UserModel.updateOne).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $set: { team: '' } }
    )
    expect(UserModel.updateMany).toHaveBeenCalledWith(
      {
        role: 0,
        managedByUserId: 'user-1',
      },
      { $set: { team: '' } }
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('rejects manager removing manager account from team', async () => {
    const TeamModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'team-1',
        name: 'Platform',
        managerUserId: null,
        save: jest.fn().mockResolvedValue(null),
      }),
    }
    const UserModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ _id: 'mgr-2', role: 2, team: 'Platform' }),
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockReturnValue(buildLeanChain([])),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'mgr-1', role: 2, team: 'Platform' },
      params: { teamId: 'team-1', userId: 'mgr-2' },
    }
    const res = buildRes()

    await invoke(controller.removeTeamMember, req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('deletes team and unassigns all accounts from that team for super admin', async () => {
    const TeamModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'team-1',
        name: 'Platform',
      }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    }
    const UserModel = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 4 }),
      updateOne: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockReturnValue(buildLeanChain([])),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'super-1', role: 4 },
      params: { teamId: 'team-1' },
    }
    const res = buildRes()

    await invoke(controller.deleteTeam, req, res)

    expect(TeamModel.findOne).toHaveBeenCalledWith({ _id: 'team-1' })
    expect(TeamModel.deleteOne).toHaveBeenCalledWith({ _id: 'team-1' })
    expect(UserModel.updateMany).toHaveBeenCalledWith(
      { team: 'Platform' },
      { $set: { team: '' } }
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('rejects deleteTeam for non-super-admin actor', async () => {
    const TeamModel = {
      findOne: jest.fn().mockResolvedValue(null),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    }
    const UserModel = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      updateOne: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockReturnValue(buildLeanChain([])),
    }

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'admin-1', role: 1 },
      params: { teamId: 'team-1' },
    }
    const res = buildRes()

    await invoke(controller.deleteTeam, req, res)

    expect(TeamModel.findOne).not.toHaveBeenCalled()
    expect(TeamModel.deleteOne).not.toHaveBeenCalled()
    expect(UserModel.updateMany).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('allows user to create guest in own team from teams flow', async () => {
    const TeamModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'team-1',
        name: 'Platform',
        managerUserId: null,
      }),
    }
    const savedGuest = {
      _id: 'guest-1',
      memberId: 'GST-1',
      name: 'Guest One',
      email: 'guest1@example.com',
      team: 'Platform',
      role: 0,
      isActive: false,
      lastLogin: null,
      save: jest.fn().mockResolvedValue(null),
    }
    const UserModel = jest.fn().mockImplementation((payload) => ({
      ...savedGuest,
      ...payload,
      save: savedGuest.save,
    }))
    UserModel.findOne = jest
      .fn()
      .mockReturnValueOnce(buildLeanChain(null))
      .mockReturnValueOnce(buildLeanChain(null))
      .mockReturnValueOnce(
        buildLeanChain({
          _id: 'user-1',
          role: 3,
          team: 'Platform',
          isActive: true,
        })
      )
    UserModel.updateMany = jest.fn().mockResolvedValue({})
    UserModel.updateOne = jest.fn().mockResolvedValue({})
    UserModel.aggregate = jest.fn().mockResolvedValue([])
    UserModel.find = jest.fn().mockReturnValue(buildLeanChain([]))

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'user-1', role: 3, team: 'Platform' },
      params: { teamId: 'team-1' },
      body: {
        name: 'Guest One',
        email: 'guest1@example.com',
        password: TEST_CREDENTIAL,
        confirmPassword: TEST_CREDENTIAL,
      },
    }
    const res = buildRes()

    await invoke(controller.createTeamGuest, req, res)

    expect(UserModel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Guest One',
        email: 'guest1@example.com',
        role: 0,
        isActive: false,
        team: 'Platform',
        managedByUserId: 'user-1',
      })
    )
    expect(savedGuest.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('rejects guest creation when selected team has no manager', async () => {
    const TeamModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'team-1',
        name: 'Platform',
        managerUserId: null,
      }),
    }
    const UserModel = jest.fn()
    UserModel.findOne = jest.fn().mockReturnValue(buildLeanChain(null))
    UserModel.updateMany = jest.fn().mockResolvedValue({})
    UserModel.updateOne = jest.fn().mockResolvedValue({})
    UserModel.aggregate = jest.fn().mockResolvedValue([])
    UserModel.find = jest.fn().mockReturnValue(buildLeanChain([]))

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'admin-1', role: 1, team: '' },
      params: { teamId: 'team-1' },
      body: {
        name: 'Guest One',
        email: 'guest1@example.com',
        password: TEST_CREDENTIAL,
        confirmPassword: TEST_CREDENTIAL,
      },
    }
    const res = buildRes()

    await invoke(controller.createTeamGuest, req, res)

    expect(UserModel).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('rejects user creating guest outside own team', async () => {
    const TeamModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'team-2',
        name: 'Data',
      }),
    }
    const UserModel = jest.fn()
    UserModel.findOne = jest.fn().mockReturnValue(buildLeanChain(null))
    UserModel.updateMany = jest.fn().mockResolvedValue({})
    UserModel.updateOne = jest.fn().mockResolvedValue({})
    UserModel.aggregate = jest.fn().mockResolvedValue([])
    UserModel.find = jest.fn().mockReturnValue(buildLeanChain([]))

    jest.doMock('../dbModels', () => ({
      TeamModel,
      UserModel,
    }))

    const controller = require('../controllers/team.controller')
    const req = {
      user: { _id: 'user-1', role: 3, team: 'Platform' },
      params: { teamId: 'team-2' },
      body: {
        name: 'Guest Two',
        email: 'guest2@example.com',
        password: TEST_CREDENTIAL,
        confirmPassword: TEST_CREDENTIAL,
      },
    }
    const res = buildRes()

    await invoke(controller.createTeamGuest, req, res)

    expect(UserModel).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
