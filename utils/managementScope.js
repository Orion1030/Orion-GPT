const { RoleLevels } = require('./constants')

const MANAGED_MEMBER_ROLES = [RoleLevels.User, RoleLevels.GUEST]
const MANAGEMENT_ROLES = [
  RoleLevels.SUPER_ADMIN,
  RoleLevels.ADMIN,
  RoleLevels.Manager,
  RoleLevels.User,
]

function toRoleNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toIdString(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object') {
    const nested = value._id ?? value.id
    if (nested == null) return ''
    return String(nested).trim()
  }
  return String(value).trim()
}

function normalizeTeamName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function isAdminTierRole(role) {
  const normalized = toRoleNumber(role)
  return normalized === RoleLevels.SUPER_ADMIN || normalized === RoleLevels.ADMIN
}

function isManagementRole(role) {
  return MANAGEMENT_ROLES.includes(toRoleNumber(role))
}

function buildManagedUserVisibilityFilter(actor) {
  const actorRole = toRoleNumber(actor?.role)
  const actorId = toIdString(actor?._id || actor?.id)
  const actorTeam = normalizeTeamName(actor?.team)

  if (actorRole === RoleLevels.SUPER_ADMIN) {
    return {}
  }

  if (actorRole === RoleLevels.ADMIN) {
    return { role: { $ne: RoleLevels.SUPER_ADMIN } }
  }

  if (actorRole === RoleLevels.Manager) {
    if (!actorTeam) return { _id: null }
    return {
      team: actorTeam,
      role: { $in: MANAGED_MEMBER_ROLES },
    }
  }

  if (actorRole === RoleLevels.User) {
    if (!actorId) return { _id: null }
    return {
      role: RoleLevels.GUEST,
      managedByUserId: actorId,
    }
  }

  return { _id: null }
}

function canManageTargetUser(actor, target) {
  const actorRole = toRoleNumber(actor?.role)
  const actorId = toIdString(actor?._id || actor?.id)
  const targetId = toIdString(target?._id || target?.id)
  const targetRole = toRoleNumber(target?.role)

  if (actorId && targetId && actorId === targetId) return false

  if (actorRole === RoleLevels.SUPER_ADMIN) return true

  if (actorRole === RoleLevels.ADMIN) {
    return !isAdminTierRole(targetRole)
  }

  if (actorRole === RoleLevels.Manager) {
    if (!MANAGED_MEMBER_ROLES.includes(targetRole)) return false
    const actorTeam = normalizeTeamName(actor?.team)
    const targetTeam = normalizeTeamName(target?.team)
    if (!actorTeam || !targetTeam) return false
    return actorTeam === targetTeam
  }

  if (actorRole === RoleLevels.User) {
    if (targetRole !== RoleLevels.GUEST) return false
    const ownerId = toIdString(target?.managedByUserId)
    return Boolean(actorId && ownerId && actorId === ownerId)
  }

  return false
}

function getAssignableRolesForActor(actor) {
  const actorRole = toRoleNumber(actor?.role)
  if (actorRole === RoleLevels.SUPER_ADMIN) {
    return [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]
  }
  if (actorRole === RoleLevels.ADMIN) {
    return [RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST]
  }
  if (actorRole === RoleLevels.Manager) {
    return [RoleLevels.User, RoleLevels.GUEST]
  }
  if (actorRole === RoleLevels.User) {
    return [RoleLevels.GUEST]
  }
  return []
}

module.exports = {
  MANAGED_MEMBER_ROLES,
  MANAGEMENT_ROLES,
  buildManagedUserVisibilityFilter,
  canManageTargetUser,
  getAssignableRolesForActor,
  isAdminTierRole,
  isManagementRole,
  normalizeTeamName,
  toIdString,
  toRoleNumber,
}
