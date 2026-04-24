const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { TeamModel, UserModel } = require('../dbModels')
const { RoleLevels } = require('../utils/constants')
const {
  canManageTargetUser,
  isManagementRole,
  normalizeTeamName,
  toIdString,
  toRoleNumber,
} = require('../utils/managementScope')

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_POLICY_REGEX = /(?=.*[A-Z|!@#$&*])(?!.*[ ]).*$/g

function isSuperAdminActor(user) {
  const role = toRoleNumber(user?.role)
  return role === RoleLevels.SUPER_ADMIN
}

function isAdminActor(user) {
  const role = toRoleNumber(user?.role)
  return role === RoleLevels.ADMIN || role === RoleLevels.SUPER_ADMIN
}

function isManagerActor(user) {
  const role = toRoleNumber(user?.role)
  return role === RoleLevels.Manager
}

function isUserActor(user) {
  const role = toRoleNumber(user?.role)
  return role === RoleLevels.User
}

function canEditTeam(actor, team) {
  if (isAdminActor(actor)) return true
  if (!isManagerActor(actor)) return false

  const actorTeam = normalizeTeamName(actor?.team)
  const targetTeam = normalizeTeamName(team?.name)
  if (!actorTeam || !targetTeam) return false
  return actorTeam === targetTeam
}

function canCreateGuestInTeam(actor, team) {
  if (isAdminActor(actor)) return true
  if (!isManagerActor(actor) && !isUserActor(actor)) return false

  const actorTeam = normalizeTeamName(actor?.team)
  const targetTeam = normalizeTeamName(team?.name)
  if (!actorTeam || !targetTeam) return false
  return actorTeam === targetTeam
}

function toTeamDto(team, options = {}) {
  const memberCounts = options.memberCounts instanceof Map ? options.memberCounts : new Map()
  const managerNameById = options.managerNameById instanceof Map ? options.managerNameById : new Map()
  const managerUserId = toIdString(team?.managerUserId)
  const normalizedName = normalizeTeamName(team?.name)

  return {
    id: toIdString(team?._id),
    name: normalizedName,
    teamKey: String(team?.teamKey || '').trim(),
    description: String(team?.description || '').trim(),
    managerUserId: managerUserId || null,
    managerName: managerUserId ? managerNameById.get(managerUserId) || '' : '',
    memberCount: Number(memberCounts.get(normalizedName) || 0),
    isActive: Boolean(team?.isActive),
    createdAt: team?.createdAt || null,
    updatedAt: team?.updatedAt || null,
  }
}

function toRoleLabel(role) {
  const normalized = Number(role)
  if (normalized === RoleLevels.SUPER_ADMIN) return 'Super Admin'
  if (normalized === RoleLevels.ADMIN) return 'Admin'
  if (normalized === RoleLevels.Manager) return 'Manager'
  if (normalized === RoleLevels.User) return 'User'
  return 'Guest'
}

function toAssignableUserDto(user) {
  return {
    id: toIdString(user?._id),
    memberId: String(user?.memberId || '').trim(),
    name: String(user?.name || '').trim(),
    email: String(user?.email || '').trim(),
    team: normalizeTeamName(user?.team),
    role: Number(user?.role),
    roleLabel: toRoleLabel(user?.role),
    isActive: Boolean(user?.isActive),
  }
}

function toTeamMemberDto(user) {
  return {
    id: toIdString(user?._id),
    memberId: String(user?.memberId || '').trim(),
    name: String(user?.name || '').trim(),
    email: String(user?.email || '').trim(),
    team: normalizeTeamName(user?.team),
    role: Number(user?.role),
    roleLabel: toRoleLabel(user?.role),
    isActive: Boolean(user?.isActive),
    lastLogin: user?.lastLogin || null,
  }
}

async function buildMemberCountByTeamName(teamsOrNames) {
  const items = Array.isArray(teamsOrNames) ? teamsOrNames : []
  const teamNames = new Set()
  const managerIds = new Set()

  for (const item of items) {
    if (typeof item === 'string' || typeof item === 'number') {
      const normalized = normalizeTeamName(item)
      if (normalized) teamNames.add(normalized)
      continue
    }

    const normalized = normalizeTeamName(item?.name)
    if (normalized) teamNames.add(normalized)

    const managerId = toIdString(item?.managerUserId)
    if (managerId) managerIds.add(managerId)
  }

  const normalizedTeamNames = Array.from(teamNames)
  if (!normalizedTeamNames.length) return new Map()

  const match = {
    team: { $in: normalizedTeamNames },
    role: { $in: [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User] },
  }
  if (managerIds.size > 0) {
    match._id = { $nin: Array.from(managerIds) }
  }

  const rows = await UserModel.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: '$team',
        count: { $sum: 1 },
      },
    },
  ])
  return new Map(rows.map((row) => [normalizeTeamName(row?._id), Number(row?.count || 0)]))
}

async function buildManagerNameMap(teams) {
  const managerIds = Array.from(
    new Set(
      (Array.isArray(teams) ? teams : [])
        .map((team) => toIdString(team?.managerUserId))
        .filter(Boolean)
    )
  )

  if (!managerIds.length) return new Map()

  const managers = await UserModel.find({ _id: { $in: managerIds } })
    .select('_id name')
    .lean()

  return new Map(managers.map((manager) => [toIdString(manager?._id), String(manager?.name || '')]))
}

async function resolveManagerUser(managerUserId, teamName) {
  if (managerUserId === undefined) {
    return { shouldSet: false, value: null, teamPatch: null }
  }

  const managerId = toIdString(managerUserId)
  if (!managerId) {
    return { shouldSet: true, value: null, teamPatch: null }
  }

  const manager = await UserModel.findOne({ _id: managerId })
    .select('_id name role team isActive')
    .lean()

  if (!manager) {
    return { shouldSet: false, value: null, teamPatch: null, status: 404, message: 'Manager user not found' }
  }

  if (toRoleNumber(manager.role) !== RoleLevels.Manager) {
    return {
      shouldSet: false,
      value: null,
      teamPatch: null,
      status: 400,
      message: 'managerUserId must reference a Manager role account',
    }
  }
  if (!manager.isActive) {
    return {
      shouldSet: false,
      value: null,
      teamPatch: null,
      status: 400,
      message: 'managerUserId must reference an active Manager account',
    }
  }

  const normalizedTeamName = normalizeTeamName(teamName)
  const managerTeam = normalizeTeamName(manager.team)
  const teamPatch =
    normalizedTeamName && managerTeam !== normalizedTeamName
      ? { userId: manager._id, team: normalizedTeamName }
      : null

  return { shouldSet: true, value: manager._id, teamPatch }
}

async function findTeamForActor(actor, teamId) {
  const team = await TeamModel.findOne({ _id: teamId })
  if (!team) {
    return { ok: false, status: 404, message: 'Team not found', team: null }
  }
  if (!canEditTeam(actor, team)) {
    return { ok: false, status: 403, message: 'Insufficient permission', team: null }
  }
  return { ok: true, status: 200, message: '', team }
}

exports.listTeams = asyncErrorHandler(async (req, res) => {
  const actor = req.user
  if (!isManagementRole(actor?.role)) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403, { showNotification: true })
  }

  const adminActor = isAdminActor(actor)
  const actorTeam = normalizeTeamName(actor?.team)
  const filter = adminActor
    ? {}
    : actorTeam
      ? { name: actorTeam }
      : { _id: null }

  const teams = await TeamModel.find(filter).sort({ name: 1, createdAt: -1 }).lean()
  const memberCounts = await buildMemberCountByTeamName(teams)
  const managerNameById = await buildManagerNameMap(teams)

  return sendJsonResult(
    res,
    true,
    teams.map((team) => toTeamDto(team, { memberCounts, managerNameById }))
  )
})

exports.createTeam = asyncErrorHandler(async (req, res) => {
  const actor = req.user
  if (!isSuperAdminActor(actor)) {
    return sendJsonResult(res, false, null, 'Only super admin can create teams', 403)
  }

  const body = req.body || {}
  const name = normalizeTeamName(body.name)
  if (!name) {
    return sendJsonResult(res, false, null, 'Team name is required', 400)
  }

  const managerResolution = await resolveManagerUser(body.managerUserId, name)
  if (managerResolution.message) {
    return sendJsonResult(
      res,
      false,
      null,
      managerResolution.message,
      managerResolution.status || 400
    )
  }

  const team = new TeamModel({
    name,
    description: String(body.description || '').trim(),
    managerUserId: managerResolution.shouldSet ? managerResolution.value : null,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    createdBy: actor?._id || null,
    updatedBy: actor?._id || null,
  })

  try {
    await team.save()
  } catch (error) {
    if (error?.code === 11000) {
      return sendJsonResult(res, false, null, 'Team name already exists', 400)
    }
    throw error
  }

  if (managerResolution.teamPatch) {
    await UserModel.updateOne(
      { _id: managerResolution.teamPatch.userId },
      { $set: { team: managerResolution.teamPatch.team } }
    )
  }

  const memberCounts = await buildMemberCountByTeamName([team])
  const managerNameById = await buildManagerNameMap([team])
  return sendJsonResult(
    res,
    true,
    toTeamDto(team, { memberCounts, managerNameById }),
    'Team created'
  )
})

exports.updateTeam = asyncErrorHandler(async (req, res) => {
  const actor = req.user
  const adminActor = isAdminActor(actor)
  const managerActor = isManagerActor(actor)
  if (!adminActor && !managerActor) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  const { teamId } = req.params
  const body = req.body || {}
  const teamResult = await findTeamForActor(actor, teamId)
  if (!teamResult.ok) {
    return sendJsonResult(res, false, null, teamResult.message, teamResult.status)
  }
  const team = teamResult.team

  const previousName = normalizeTeamName(team.name)
  let nextName = previousName
  let touched = false

  if (body.name !== undefined) {
    if (!adminActor) {
      return sendJsonResult(res, false, null, 'Manager cannot rename team', 403)
    }
    nextName = normalizeTeamName(body.name)
    if (!nextName) {
      return sendJsonResult(res, false, null, 'Team name is required', 400)
    }
    touched = true
  }

  if (body.description !== undefined) {
    team.description = String(body.description || '').trim()
    touched = true
  }
  if (body.isActive !== undefined) {
    if (!adminActor) {
      return sendJsonResult(res, false, null, 'Manager cannot change active status', 403)
    }
    team.isActive = Boolean(body.isActive)
    touched = true
  }

  let managerResolution = { shouldSet: false, teamPatch: null }
  if (body.managerUserId !== undefined) {
    if (!adminActor) {
      return sendJsonResult(res, false, null, 'Manager cannot reassign team manager', 403)
    }
    managerResolution = await resolveManagerUser(body.managerUserId, nextName)
    if (managerResolution.message) {
      return sendJsonResult(
        res,
        false,
        null,
        managerResolution.message,
        managerResolution.status || 400
      )
    }
    if (managerResolution.shouldSet) {
      team.managerUserId = managerResolution.value
      touched = true
    }
  }

  if (!touched) {
    return sendJsonResult(res, false, null, 'No update fields provided', 400)
  }

  team.name = nextName
  team.updatedBy = actor?._id || null

  try {
    await team.save()
  } catch (error) {
    if (error?.code === 11000) {
      return sendJsonResult(res, false, null, 'Team name already exists', 400)
    }
    throw error
  }

  const renamed = previousName && nextName && previousName !== nextName
  if (renamed) {
    await UserModel.updateMany({ team: previousName }, { $set: { team: nextName } })
  }

  if (managerResolution.teamPatch) {
    await UserModel.updateOne(
      { _id: managerResolution.teamPatch.userId },
      { $set: { team: managerResolution.teamPatch.team } }
    )
  }

  const memberCounts = await buildMemberCountByTeamName([team])
  const managerNameById = await buildManagerNameMap([team])
  return sendJsonResult(
    res,
    true,
    toTeamDto(team, { memberCounts, managerNameById }),
    'Team updated'
  )
})

exports.deleteTeam = asyncErrorHandler(async (req, res) => {
  const actor = req.user
  if (!isSuperAdminActor(actor)) {
    return sendJsonResult(res, false, null, 'Only super admin can delete teams', 403)
  }

  const { teamId } = req.params
  const team = await TeamModel.findOne({ _id: teamId })
  if (!team) {
    return sendJsonResult(res, false, null, 'Team not found', 404)
  }

  const targetTeamName = normalizeTeamName(team.name)
  await TeamModel.deleteOne({ _id: team._id })

  const unassignResult = targetTeamName
    ? await UserModel.updateMany(
        { team: targetTeamName },
        { $set: { team: '' } }
      )
    : { modifiedCount: 0 }

  return sendJsonResult(
    res,
    true,
    {
      teamId: toIdString(team._id),
      unassignedCount: Number(unassignResult?.modifiedCount || 0),
    },
    'Team deleted'
  )
})

exports.listAssignableUsers = asyncErrorHandler(async (req, res) => {
  const actor = req.user
  const adminActor = isAdminActor(actor)
  const managerActor = isManagerActor(actor)
  if (!adminActor && !managerActor) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  const { teamId } = req.params
  const teamResult = await findTeamForActor(actor, teamId)
  if (!teamResult.ok) {
    return sendJsonResult(res, false, null, teamResult.message, teamResult.status)
  }
  const team = teamResult.team
  const targetTeamName = normalizeTeamName(team.name)

  const baseFilter = {
    role: RoleLevels.User,
    isActive: true,
    team: { $ne: targetTeamName },
  }

  if (managerActor && !adminActor) {
    baseFilter.$or = [{ team: '' }, { team: null }, { team: { $exists: false } }]
  }

  const users = await UserModel.find(baseFilter)
    .select('_id memberId name email role team isActive')
    .sort({ name: 1, createdAt: 1 })
    .lean()

  return sendJsonResult(res, true, users.map(toAssignableUserDto))
})

exports.addTeamMembers = asyncErrorHandler(async (req, res) => {
  const actor = req.user
  const adminActor = isAdminActor(actor)
  const managerActor = isManagerActor(actor)
  if (!adminActor && !managerActor) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  const { teamId } = req.params
  const teamResult = await findTeamForActor(actor, teamId)
  if (!teamResult.ok) {
    return sendJsonResult(res, false, null, teamResult.message, teamResult.status)
  }
  const team = teamResult.team
  const targetTeamName = normalizeTeamName(team.name)

  const inputUserIds = Array.isArray(req.body?.userIds)
    ? req.body.userIds.map((value) => toIdString(value)).filter(Boolean)
    : []
  const uniqueUserIds = Array.from(new Set(inputUserIds))
  if (!uniqueUserIds.length) {
    return sendJsonResult(res, false, null, 'At least one user is required', 400)
  }

  const candidates = await UserModel.find({ _id: { $in: uniqueUserIds } })
    .select('_id role team isActive')
    .lean()

  const candidateById = new Map(candidates.map((user) => [toIdString(user?._id), user]))
  const missingIds = uniqueUserIds.filter((userId) => !candidateById.has(userId))
  if (missingIds.length > 0) {
    return sendJsonResult(res, false, null, 'Some users were not found', 404)
  }

  const invalidRoleIds = uniqueUserIds.filter((userId) => {
    const candidate = candidateById.get(userId)
    return Number(candidate?.role) !== RoleLevels.User
  })
  if (invalidRoleIds.length > 0) {
    return sendJsonResult(res, false, null, 'Only role User accounts can be added to team', 400)
  }

  const inactiveIds = uniqueUserIds.filter((userId) => !candidateById.get(userId)?.isActive)
  if (inactiveIds.length > 0) {
    return sendJsonResult(res, false, null, 'Inactive users cannot be added to team', 400)
  }

  if (managerActor && !adminActor) {
    const invalidTeamIds = uniqueUserIds.filter((userId) => {
      const candidate = candidateById.get(userId)
      const existingTeam = normalizeTeamName(candidate?.team)
      return Boolean(existingTeam && existingTeam !== targetTeamName)
    })
    if (invalidTeamIds.length > 0) {
      return sendJsonResult(
        res,
        false,
        null,
        'Manager can add only unassigned users to their own team',
        403
      )
    }
  }

  await UserModel.updateMany(
    { _id: { $in: uniqueUserIds } },
    { $set: { team: targetTeamName } }
  )
  await UserModel.updateMany(
    {
      role: RoleLevels.GUEST,
      managedByUserId: { $in: uniqueUserIds },
    },
    { $set: { team: targetTeamName } }
  )

  return sendJsonResult(res, true, { addedCount: uniqueUserIds.length }, 'Team members added')
})

exports.listTeamMembers = asyncErrorHandler(async (req, res) => {
  const actor = req.user
  const adminActor = isAdminActor(actor)
  const managerActor = isManagerActor(actor)
  if (!adminActor && !managerActor) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  const { teamId } = req.params
  const teamResult = await findTeamForActor(actor, teamId)
  if (!teamResult.ok) {
    return sendJsonResult(res, false, null, teamResult.message, teamResult.status)
  }
  const team = teamResult.team
  const targetTeamName = normalizeTeamName(team.name)

  const members = await UserModel.find({
    role: { $in: [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User] },
    team: targetTeamName,
  })
    .select('_id memberId name email team role isActive lastLogin')
    .sort({ name: 1, createdAt: 1 })
    .lean()

  return sendJsonResult(res, true, members.map(toTeamMemberDto))
})

exports.removeTeamMember = asyncErrorHandler(async (req, res) => {
  const actor = req.user
  const adminActor = isAdminActor(actor)
  const managerActor = isManagerActor(actor)
  if (!adminActor && !managerActor) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  const { teamId, userId } = req.params
  const teamResult = await findTeamForActor(actor, teamId)
  if (!teamResult.ok) {
    return sendJsonResult(res, false, null, teamResult.message, teamResult.status)
  }
  const team = teamResult.team
  const targetTeamName = normalizeTeamName(team.name)

  const member = await UserModel.findOne({
    _id: userId,
    role: { $in: [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User] },
    team: targetTeamName,
  })
    .select('_id role team')
    .lean()

  if (!member) {
    return sendJsonResult(res, false, null, 'Team member not found', 404)
  }

  if (!canManageTargetUser(actor, member)) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  await UserModel.updateOne(
    { _id: member._id },
    { $set: { team: '' } }
  )
  await UserModel.updateMany(
    {
      role: RoleLevels.GUEST,
      managedByUserId: member._id,
    },
    { $set: { team: '' } }
  )

  const managerId = toIdString(team.managerUserId)
  const removedId = toIdString(member._id)
  if (managerId && removedId && managerId === removedId) {
    team.managerUserId = null
    team.updatedBy = actor?._id || null
    await team.save()
  }

  return sendJsonResult(res, true, { userId: toIdString(member._id) }, 'Team member removed')
})

exports.createTeamGuest = asyncErrorHandler(async (req, res) => {
  const actor = req.user
  const adminActor = isAdminActor(actor)
  const managerActor = isManagerActor(actor)
  const userActor = isUserActor(actor)
  if (!adminActor && !managerActor && !userActor) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  const { teamId } = req.params
  const body = req.body || {}
  const team = await TeamModel.findOne({ _id: teamId })
  if (!team) {
    return sendJsonResult(res, false, null, 'Team not found', 404)
  }
  if (!canCreateGuestInTeam(actor, team)) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  const name = String(body.name || '').trim()
  const email = String(body.email || '')
    .trim()
    .toLowerCase()
  const password = String(body.password || '')
  const confirmPassword = String(body.confirmPassword || '')

  if (!name) {
    return sendJsonResult(res, false, null, 'Name is required', 400)
  }
  if (!email) {
    return sendJsonResult(res, false, null, 'Email is required', 400)
  }
  if (!EMAIL_REGEX.test(email)) {
    return sendJsonResult(res, false, null, 'Invalid email format', 400)
  }
  if (!password) {
    return sendJsonResult(res, false, null, 'Password is required', 400)
  }
  if (password.length < 8) {
    return sendJsonResult(res, false, null, 'Password must be at least 8 characters', 400)
  }
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    return sendJsonResult(
      res,
      false,
      null,
      'Password must include at least one capital letter or special character and contain no spaces',
      400
    )
  }
  if (password !== confirmPassword) {
    return sendJsonResult(res, false, null, 'Password and confirm password should match', 400)
  }

  const existingByName = await UserModel.findOne({ name })
    .select('_id')
    .lean()
  if (existingByName) {
    return sendJsonResult(res, false, null, 'Existing user', 400)
  }

  const existingByEmail = await UserModel.findOne({ email })
    .select('_id')
    .lean()
  if (existingByEmail) {
    return sendJsonResult(res, false, null, 'Email is already in use', 400)
  }

  const requestedOwnerId = userActor
    ? toIdString(actor?._id || actor?.id)
    : toIdString(team.managerUserId)
  if (!requestedOwnerId) {
    return sendJsonResult(
      res,
      false,
      null,
      'Selected team has no manager. Assign a manager before creating guests.',
      400
    )
  }

  const owner = await UserModel.findOne({ _id: requestedOwnerId })
    .select('_id role team isActive')
    .lean()
  const expectedOwnerRole = userActor ? RoleLevels.User : RoleLevels.Manager
  if (!owner || !owner.isActive || Number(owner.role) !== expectedOwnerRole) {
    return sendJsonResult(
      res,
      false,
      null,
      userActor
        ? 'Requesting user must be an active User account'
        : 'Team manager must be an active Manager account',
      400
    )
  }

  const targetTeamName = normalizeTeamName(team.name)
  const ownerTeamName = normalizeTeamName(owner.team)
  if (!targetTeamName || ownerTeamName !== targetTeamName) {
    return sendJsonResult(
      res,
      false,
      null,
      userActor
        ? 'Requesting user must belong to the target team'
        : 'Team manager must belong to the target team',
      400
    )
  }

  const guest = new UserModel({
    name,
    email,
    password,
    role: RoleLevels.GUEST,
    isActive: true,
    managedByUserId: owner._id,
    team: targetTeamName,
  })
  await guest.save()

  return sendJsonResult(res, true, toTeamMemberDto(guest), 'Guest user created', 201)
})
