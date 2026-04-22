const { RoleLevels } = require('../utils/constants')
const {
  buildManagedUserVisibilityFilter,
  canManageTargetUser,
  getAssignableRolesForActor,
} = require('../utils/managementScope')

describe('managementScope utils', () => {
  it('builds admin visibility filter excluding super admin', () => {
    expect(buildManagedUserVisibilityFilter({ role: RoleLevels.ADMIN })).toEqual({
      role: { $ne: RoleLevels.SUPER_ADMIN },
    })
  })

  it('builds manager visibility filter scoped to team users and guests', () => {
    expect(
      buildManagedUserVisibilityFilter({
        role: RoleLevels.Manager,
        team: 'Platform',
      })
    ).toEqual({
      team: 'Platform',
      role: { $in: [RoleLevels.User, RoleLevels.GUEST] },
    })
  })

  it('builds user visibility filter scoped to owned guests', () => {
    expect(
      buildManagedUserVisibilityFilter({
        _id: 'user-1',
        role: RoleLevels.User,
      })
    ).toEqual({
      role: RoleLevels.GUEST,
      managedByUserId: 'user-1',
    })
  })

  it('allows manager to manage only user/guest in same team', () => {
    const actor = { _id: 'mgr-1', role: RoleLevels.Manager, team: 'Platform' }
    expect(
      canManageTargetUser(actor, { _id: 'u-1', role: RoleLevels.User, team: 'Platform' })
    ).toBe(true)
    expect(
      canManageTargetUser(actor, { _id: 'g-1', role: RoleLevels.GUEST, team: 'Platform' })
    ).toBe(true)
    expect(
      canManageTargetUser(actor, { _id: 'u-2', role: RoleLevels.User, team: 'Data' })
    ).toBe(false)
    expect(
      canManageTargetUser(actor, { _id: 'a-1', role: RoleLevels.ADMIN, team: 'Platform' })
    ).toBe(false)
  })

  it('allows user to manage only owned guests', () => {
    const actor = { _id: 'user-1', role: RoleLevels.User, team: 'Platform' }
    expect(
      canManageTargetUser(actor, {
        _id: 'guest-1',
        role: RoleLevels.GUEST,
        team: 'Platform',
        managedByUserId: 'user-1',
      })
    ).toBe(true)
    expect(
      canManageTargetUser(actor, {
        _id: 'guest-2',
        role: RoleLevels.GUEST,
        team: 'Platform',
        managedByUserId: 'user-2',
      })
    ).toBe(false)
  })

  it('returns assignable roles by actor tier', () => {
    expect(getAssignableRolesForActor({ role: RoleLevels.SUPER_ADMIN })).toEqual([
      RoleLevels.ADMIN,
      RoleLevels.Manager,
      RoleLevels.User,
      RoleLevels.GUEST,
    ])
    expect(getAssignableRolesForActor({ role: RoleLevels.ADMIN })).toEqual([
      RoleLevels.Manager,
      RoleLevels.User,
      RoleLevels.GUEST,
    ])
    expect(getAssignableRolesForActor({ role: RoleLevels.Manager })).toEqual([
      RoleLevels.User,
      RoleLevels.GUEST,
    ])
    expect(getAssignableRolesForActor({ role: RoleLevels.User })).toEqual([
      RoleLevels.GUEST,
    ])
  })
})
