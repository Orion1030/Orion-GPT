describe('admin.controller listUsers scope', () => {
  jest.setTimeout(20000)

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

  function buildFindChain(result) {
    return {
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(result),
        }),
      }),
    }
  }

  function buildFindOneChain(result) {
    return {
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(result),
        }),
      }),
    }
  }

  it('scopes manager to same-team user + guest records', async () => {
    const find = jest.fn().mockReturnValue(buildFindChain([]))

    jest.doMock('../dbModels', () => ({
      UserModel: { find },
    }))
    jest.doMock('../realtime/socketServer', () => ({
      getOnlineUserIds: jest.fn().mockReturnValue([]),
      isUserOnline: jest.fn().mockReturnValue(false),
    }))

    const controller = require('../controllers/admin.controller')
    const req = { user: { _id: 'mgr-1', role: 2, team: 'Platform' } }
    const res = buildRes()

    await invoke(controller.listUsers, req, res)

    expect(find).toHaveBeenCalledWith({
      team: 'Platform',
      role: { $in: [3, 0] },
    })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('scopes user to owned guest records', async () => {
    const find = jest.fn().mockReturnValue(buildFindChain([]))

    jest.doMock('../dbModels', () => ({
      UserModel: { find },
    }))
    jest.doMock('../realtime/socketServer', () => ({
      getOnlineUserIds: jest.fn().mockReturnValue([]),
      isUserOnline: jest.fn().mockReturnValue(false),
    }))

    const controller = require('../controllers/admin.controller')
    const req = { user: { _id: 'user-1', role: 3, team: 'Platform' } }
    const res = buildRes()

    await invoke(controller.listUsers, req, res)

    expect(find).toHaveBeenCalledWith({
      role: 0,
      managedByUserId: 'user-1',
    })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('resolves owner hierarchy for guest, user, manager, and admin rows', async () => {
    const users = [
      { _id: 'guest-1', memberId: 'GST-1', name: 'Guest One', team: 'Platform', role: 0, isActive: true, managedByUserId: 'user-1' },
      { _id: 'user-1', memberId: 'USR-1', name: 'Worker One', team: 'Platform', role: 3, isActive: true, managedByUserId: null },
      { _id: 'mgr-1', memberId: 'MGR-1', name: 'Manager One', team: 'Platform', role: 2, isActive: true, managedByUserId: null },
      { _id: 'admin-1', memberId: 'ADM-1', name: 'Admin One', team: 'Ops', role: 1, isActive: true, managedByUserId: null },
    ]

    const owners = [
      { _id: 'user-1', memberId: 'USR-1', name: 'Worker One' },
      { _id: 'mgr-team-1', memberId: 'MGR-T', name: 'Team Manager' },
      { _id: 'mgr-ops-1', memberId: 'MGR-O', name: 'Ops Manager' },
      { _id: 'super-1', memberId: 'SUP-1', name: 'Root Admin' },
    ]

    const find = jest
      .fn()
      .mockReturnValueOnce(buildFindChain(users))
      .mockReturnValueOnce(buildFindChain(owners))
    const findOne = jest.fn().mockReturnValue(buildFindOneChain({ _id: 'super-1' }))
    const teamFind = jest.fn().mockReturnValue(
      buildFindChain([
        { name: 'Platform', managerUserId: 'mgr-team-1' },
        { name: 'Ops', managerUserId: 'mgr-ops-1' },
      ])
    )

    jest.doMock('../dbModels', () => ({
      UserModel: { find, findOne },
      TeamModel: { find: teamFind },
    }))
    jest.doMock('../realtime/socketServer', () => ({
      getOnlineUserIds: jest.fn().mockReturnValue([]),
      isUserOnline: jest.fn().mockReturnValue(false),
    }))

    const controller = require('../controllers/admin.controller')
    const req = { user: { _id: 'admin-2', role: 1, team: 'Platform' } }
    const res = buildRes()

    await invoke(controller.listUsers, req, res)

    expect(find).toHaveBeenCalledWith({ role: { $ne: 4 } })
    const payload = res.json.mock.calls[0][0]
    const rows = Array.isArray(payload?.data) ? payload.data : []
    const byId = Object.fromEntries(rows.map((row) => [String(row.id), row]))

    expect(byId['guest-1'].ownerUserId).toBe('user-1')
    expect(byId['guest-1'].ownerName).toBe('Worker One')
    expect(byId['user-1'].ownerUserId).toBe('mgr-team-1')
    expect(byId['user-1'].ownerName).toBe('Team Manager')
    expect(byId['mgr-1'].ownerUserId).toBe('super-1')
    expect(byId['mgr-1'].ownerName).toBe('Root Admin')
    expect(byId['admin-1'].ownerUserId).toBe('mgr-ops-1')
    expect(byId['admin-1'].ownerName).toBe('Ops Manager')
  })
})
