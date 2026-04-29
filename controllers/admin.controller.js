const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const {
  AdminConfigurationModel,
  ApplicationEventModel,
  ApplicationModel,
  ChatMessageModel,
  ChatSessionModel,
  JobDescriptionModel,
  JobModel,
  NotificationModel,
  ProfileModel,
  PromptAuditModel,
  PromptModel,
  ResumeModel,
  TeamModel,
  TemplateModel,
  UserModel,
} = require('../dbModels')
const { RoleLevels, StatusCodes } = require('../utils/constants')
const { buildUsageMetricsMap, createEmptyUsageMetrics } = require('../services/usageMetrics.service')
const { verifyRequesterPassword } = require('../services/auth.service')
const { getOnlineUserIds, isUserOnline } = require('../realtime/socketServer')
const {
  buildDefaultUserIdentifierFromObjectId,
  isValidUserIdentifier,
  normalizeUserIdentifier,
} = require('../utils/userIdentifier')
const {
  buildManagedUserVisibilityFilter,
  canManageTargetUser,
  getAssignableRolesForActor,
  normalizeTeamName,
  toIdString,
  toRoleNumber,
} = require('../utils/managementScope')

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_POLICY_REGEX = /(?=.*[A-Z|!@#$&*])(?!.*[ ]).*$/

function toRoleLabel(role) {
  const normalized = Number(role)
  if (normalized === RoleLevels.SUPER_ADMIN) return 'Super Admin'
  if (normalized === RoleLevels.ADMIN) return 'Admin'
  if (normalized === RoleLevels.Manager) return 'Manager'
  if (normalized === RoleLevels.User) return 'User'
  return 'Guest'
}

function isValidManagedRole(role) {
  return (
    role === RoleLevels.ADMIN ||
    role === RoleLevels.Manager ||
    role === RoleLevels.User ||
    role === RoleLevels.GUEST
  )
}

function isValidGuestOwnerRole(role) {
  return (
    role === RoleLevels.SUPER_ADMIN ||
    role === RoleLevels.ADMIN ||
    role === RoleLevels.Manager ||
    role === RoleLevels.User
  )
}

function actorCanManageRole(actor, role) {
  const assignableRoles = getAssignableRolesForActor(actor)
  return assignableRoles.includes(Number(role))
}

function toPublicUser(user, options = {}) {
  const userId = String(user._id)
  const onlineUserIds = options.onlineUserIds instanceof Set ? options.onlineUserIds : null
  const ownerLookup = options.ownerLookup instanceof Map ? options.ownerLookup : null
  const teamManagerByName = options.teamManagerByName instanceof Map ? options.teamManagerByName : null
  const superAdminOwnerId = toIdString(options.superAdminOwnerId)
  const isOnline = onlineUserIds ? onlineUserIds.has(userId) : isUserOnline(userId)
  const memberId = String(user.memberId || '').trim() || buildDefaultUserIdentifierFromObjectId(user._id)
  const includeManageFields = Boolean(options.includeManageFields)
  const normalizedRole = Number(user.role)
  const normalizedTeam = normalizeTeamName(user.team)

  let ownerUserId = ''
  if (normalizedRole === RoleLevels.GUEST) {
    ownerUserId = toIdString(user.managedByUserId)
  } else if (normalizedRole === RoleLevels.User) {
    ownerUserId = normalizedTeam && teamManagerByName ? toIdString(teamManagerByName.get(normalizedTeam)) : ''
  } else if (normalizedRole === RoleLevels.ADMIN) {
    const teamManagerId =
      normalizedTeam && teamManagerByName ? toIdString(teamManagerByName.get(normalizedTeam)) : ''
    ownerUserId = teamManagerId || superAdminOwnerId
  } else if (normalizedRole === RoleLevels.Manager) {
    ownerUserId = superAdminOwnerId
  }

  const owner = ownerUserId && ownerLookup ? ownerLookup.get(ownerUserId) : null

  const dto = {
    id: userId,
    memberId,
    name: user.name || '',
    team: normalizeTeamName(user.team),
    role: Number(user.role),
    roleLabel: toRoleLabel(user.role),
    isActive: Boolean(user.isActive),
    isOnline,
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    ownerUserId: ownerUserId || null,
    ownerName: owner?.name || '',
    ownerMemberId: owner?.memberId || '',
  }

  if (includeManageFields) {
    dto.email = user.email || ''
    dto.contactNumber = user.contactNumber || ''
    dto.avatarUrl = user.avatarUrl || ''
    dto.avatarStorageKey = user.avatarStorageKey || ''
    dto.avatarUpdatedAt = user.avatarUpdatedAt || null
    dto.managedByUserId = user.managedByUserId ? String(user.managedByUserId) : null
  }

  return dto
}

function normalizeObjectIdArray(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => toIdString(value))
        .filter(Boolean)
    )
  )
}

function toGuestAssignableProfileDto(profile, assignedProfileIds = []) {
  const profileId = toIdString(profile?._id || profile?.id)
  const assignedSet = assignedProfileIds instanceof Set
    ? assignedProfileIds
    : new Set(normalizeObjectIdArray(assignedProfileIds))

  return {
    id: profileId,
    fullName: String(profile?.fullName || '').trim(),
    title: String(profile?.title || '').trim(),
    mainStack: String(profile?.mainStack || '').trim(),
    defaultTemplateId: toIdString(profile?.defaultTemplateId) || null,
    status: Number(profile?.status) === StatusCodes.ACTIVE ? 'Active' : 'Inactive',
    updatedAt: profile?.updatedAt || null,
    isAssigned: assignedSet.has(profileId),
  }
}

async function findManagedGuest(actor, guestId, select = '_id role team managedByUserId assignedProfileIds') {
  const guest = await UserModel.findOne({ _id: guestId })
    .select(select)
    .lean()

  if (!guest || Number(guest.role) !== RoleLevels.GUEST) {
    return {
      guest: null,
      error: { status: 404, message: 'Guest not found' },
    }
  }

  if (!canManageTargetUser(actor, guest)) {
    return {
      guest: null,
      error: { status: 403, message: 'Insufficient permission' },
    }
  }

  return { guest, error: null }
}

async function buildOwnerLookup(users) {
  const ownerIds = Array.from(
    new Set(
      (Array.isArray(users) ? users : [])
        .map((user) => toIdString(user))
        .filter(Boolean)
    )
  )
  if (!ownerIds.length) return new Map()

  const owners = await UserModel.find({ _id: { $in: ownerIds } })
    .select('_id memberId name')
    .sort({ createdAt: 1, _id: 1 })
    .lean()
  return new Map(
    owners.map((owner) => [
      String(owner._id),
      {
        memberId: String(owner.memberId || '').trim(),
        name: String(owner.name || '').trim(),
      },
    ])
  )
}

async function buildHierarchyOwnerContext(users) {
  const rows = Array.isArray(users) ? users : []
  const teamNames = Array.from(
    new Set(
      rows
        .filter((row) => {
          const role = Number(row?.role)
          return role === RoleLevels.User || role === RoleLevels.ADMIN
        })
        .map((row) => normalizeTeamName(row?.team))
        .filter(Boolean)
    )
  )

  const teamManagerByName = new Map()
  if (teamNames.length > 0 && TeamModel) {
    const teamRows = await TeamModel.find({ name: { $in: teamNames } })
      .select('name managerUserId')
      .sort({ name: 1 })
      .lean()

    for (const teamRow of teamRows) {
      const teamName = normalizeTeamName(teamRow?.name)
      const managerId = toIdString(teamRow?.managerUserId)
      if (teamName && managerId) {
        teamManagerByName.set(teamName, managerId)
      }
    }
  }

  const hasAdminOrManager = rows.some((row) => {
    const role = Number(row?.role)
    return role === RoleLevels.ADMIN || role === RoleLevels.Manager
  })

  let superAdminOwnerId = ''
  if (hasAdminOrManager) {
    const superAdmin = await UserModel.findOne({
      role: RoleLevels.SUPER_ADMIN,
      isActive: true,
    })
      .select('_id')
      .sort({ createdAt: 1, _id: 1 })
      .lean()
    superAdminOwnerId = toIdString(superAdmin?._id)
  }

  const ownerIds = new Set()
  for (const row of rows) {
    const role = Number(row?.role)

    if (role === RoleLevels.GUEST) {
      const ownerId = toIdString(row?.managedByUserId)
      if (ownerId) ownerIds.add(ownerId)
      continue
    }

    if (role === RoleLevels.User) {
      const teamName = normalizeTeamName(row?.team)
      const ownerId = teamName ? toIdString(teamManagerByName.get(teamName)) : ''
      if (ownerId) ownerIds.add(ownerId)
      continue
    }

    if (role === RoleLevels.ADMIN) {
      const teamName = normalizeTeamName(row?.team)
      const ownerId = teamName ? toIdString(teamManagerByName.get(teamName)) : ''
      if (ownerId) {
        ownerIds.add(ownerId)
      } else if (superAdminOwnerId) {
        ownerIds.add(superAdminOwnerId)
      }
      continue
    }

    if (role === RoleLevels.Manager) {
      if (superAdminOwnerId) ownerIds.add(superAdminOwnerId)
    }
  }

  return {
    ownerLookup: await buildOwnerLookup(Array.from(ownerIds)),
    teamManagerByName,
    superAdminOwnerId: superAdminOwnerId || null,
  }
}

function buildTotals(rows) {
  const totals = {
    userCount: rows.length,
    llmEstimatedCalls: 0,
    profileCount: 0,
    resumeCount: 0,
    resumeDownloads: 0,
    jdAppliedCount: 0,
    chatMessages: 0,
    applications: 0,
  }

  for (const row of rows) {
    const metrics = row.metrics || createEmptyUsageMetrics()
    totals.llmEstimatedCalls += Number(metrics.llmUsage?.estimatedCallCount || 0)
    totals.profileCount += Number(metrics.profileCount || 0)
    totals.resumeCount += Number(metrics.resume?.count || 0)
    totals.resumeDownloads += Number(metrics.resume?.downloadCount || 0)
    totals.jdAppliedCount += Number(metrics.resume?.jdAppliedCount || 0)
    totals.chatMessages += Number(metrics.chat?.totalMessages || 0)
    totals.applications += Number(metrics.applications?.total || 0)
  }

  return totals
}

async function verifyStepUpPassword(req, password) {
  if (!String(password || '').trim()) {
    return { ok: false, status: 400, message: 'Your password is required' }
  }

  const verified = await verifyRequesterPassword(req, password)
  if (!verified) {
    return { ok: false, status: 401, message: 'Password verification failed' }
  }

  return { ok: true, status: 200, message: '' }
}

function buildVisibilityFilter(user) {
  return buildManagedUserVisibilityFilter(user)
}

async function findVisibleTargetUser(actor, userId, select) {
  const visibilityFilter = buildVisibilityFilter(actor)
  return UserModel.findOne({ _id: userId, ...visibilityFilter }).select(select).lean()
}

async function resetUserPasswordCore({
  req,
  targetUserId,
  newPassword,
  confirmPassword,
  adminPassword,
}) {
  const visibilityFilteredTarget = await findVisibleTargetUser(
    req.user,
    targetUserId,
    '_id role team managedByUserId'
  )
  if (!visibilityFilteredTarget) {
    return { ok: false, status: 404, message: 'User not found' }
  }

  if (!canManageTargetUser(req.user, visibilityFilteredTarget)) {
    return { ok: false, status: 403, message: 'Insufficient permission' }
  }

  const stepUp = await verifyStepUpPassword(req, adminPassword)
  if (!stepUp.ok) {
    return stepUp
  }

  const normalizedPassword = String(newPassword || '')
  const normalizedConfirmPassword = String(confirmPassword || '')
  if (!normalizedPassword) {
    return { ok: false, status: 400, message: 'Enter new password' }
  }
  if (normalizedPassword !== normalizedConfirmPassword) {
    return {
      ok: false,
      status: 400,
      message: "New password and confirm password doesn't match",
    }
  }
  if (normalizedPassword.length < 8) {
    return { ok: false, status: 400, message: 'Password must be at least 8 characters' }
  }
  if (!PASSWORD_POLICY_REGEX.test(normalizedPassword)) {
    return {
      ok: false,
      status: 400,
      message: 'Password must include at least one capital letter or special character and contain no spaces',
    }
  }

  const user = await UserModel.findOne({ _id: targetUserId })
  if (!user) {
    return { ok: false, status: 404, message: 'User not found' }
  }

  user.password = normalizedPassword
  await user.save()
  return { ok: true, status: 200, message: 'Password reset successfully' }
}

function toDeletedCount(result) {
  return Number(result?.deletedCount || 0)
}

async function deleteOwnedUserData(targetUserId) {
  const chatSessions = await ChatSessionModel.find({ userId: targetUserId })
    .select('_id')
    .lean()
  const chatSessionIds = chatSessions
    .map((session) => session?._id)
    .filter(Boolean)

  const [
    profiles,
    resumes,
    applications,
    applicationEvents,
    chatMessages,
    removedChatSessions,
    jobDescriptions,
    jobs,
    templates,
    prompts,
    promptAudits,
    notifications,
    adminConfigurations,
  ] = await Promise.all([
    ProfileModel.deleteMany({ userId: targetUserId }),
    ResumeModel.deleteMany({ userId: targetUserId }),
    ApplicationModel.deleteMany({ userId: targetUserId }),
    ApplicationEventModel.deleteMany({ userId: targetUserId }),
    chatSessionIds.length > 0
      ? ChatMessageModel.deleteMany({ sessionId: { $in: chatSessionIds } })
      : Promise.resolve({ deletedCount: 0 }),
    ChatSessionModel.deleteMany({ userId: targetUserId }),
    JobDescriptionModel.deleteMany({ userId: targetUserId }),
    JobModel.deleteMany({ userId: targetUserId }),
    TemplateModel.deleteMany({ userId: targetUserId }),
    PromptModel.deleteMany({ owner: targetUserId }),
    PromptAuditModel.deleteMany({ ownerUserId: targetUserId }),
    NotificationModel.deleteMany({
      $or: [{ toUserId: targetUserId }, { fromUserId: targetUserId }],
    }),
    AdminConfigurationModel.deleteMany({ ownerUserId: targetUserId }),
  ])

  return {
    profiles: toDeletedCount(profiles),
    resumes: toDeletedCount(resumes),
    applications: toDeletedCount(applications),
    applicationEvents: toDeletedCount(applicationEvents),
    chatSessions: toDeletedCount(removedChatSessions),
    chatMessages: toDeletedCount(chatMessages),
    jobDescriptions: toDeletedCount(jobDescriptions),
    jobs: toDeletedCount(jobs),
    templates: toDeletedCount(templates),
    prompts: toDeletedCount(prompts),
    promptAudits: toDeletedCount(promptAudits),
    notifications: toDeletedCount(notifications),
    adminConfigurations: toDeletedCount(adminConfigurations),
  }
}

exports.changeMemberPassword = asyncErrorHandler(async (req, res) => {
  const { newPassword, confirmPassword, memberId, adminPassword } = req.body || {}
  if (!memberId) {
    return sendJsonResult(res, false, null, 'User not found', 400)
  }

  const result = await resetUserPasswordCore({
    req,
    targetUserId: memberId,
    newPassword,
    confirmPassword,
    adminPassword,
  })

  if (!result.ok) {
    return sendJsonResult(res, false, null, result.message, result.status)
  }

  return sendJsonResult(res, true, null, result.message)
})

exports.allowMember = asyncErrorHandler(async (req, res) => {
  const { userId } = req.body
  const visibilityFilteredTarget = await findVisibleTargetUser(
    req.user,
    userId,
    '_id role team managedByUserId'
  )

  if (!visibilityFilteredTarget) {
    return sendJsonResult(res, false, null, 'User not found', 400)
  }
  if (!canManageTargetUser(req.user, visibilityFilteredTarget)) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  await UserModel.updateOne({ _id: userId }, { $set: { isActive: true } })
  return sendJsonResult(res, true, null, 'User Activated successfully')
})

exports.getUsageMetrics = asyncErrorHandler(async (req, res) => {
  const visibilityFilter = buildVisibilityFilter(req.user)
  const users = await UserModel.find(visibilityFilter)
    .select('_id memberId name team role isActive lastLogin createdAt managedByUserId')
    .sort({ name: 1, createdAt: 1 })
    .lean()

  const onlineUserIds = new Set(getOnlineUserIds())
  const metricsByUserId = await buildUsageMetricsMap({ userIds: users.map((user) => user._id) })

  const rows = users.map((user) => {
    const userId = String(user._id)
    return {
      user: toPublicUser(user, { onlineUserIds }),
      metrics: metricsByUserId[userId] || createEmptyUsageMetrics(),
    }
  })

  return sendJsonResult(res, true, {
    generatedAt: new Date().toISOString(),
    totals: buildTotals(rows),
    users: rows,
  })
})

exports.getUsageMetricsForUser = asyncErrorHandler(async (req, res) => {
  const { userId } = req.params

  const user = await findVisibleTargetUser(
    req.user,
    userId,
    '_id memberId name team role isActive lastLogin createdAt managedByUserId'
  )

  if (!user) {
    return sendJsonResult(res, false, null, 'User not found', 404)
  }

  const metricsByUserId = await buildUsageMetricsMap({ userIds: [user._id] })
  const normalizedId = String(user._id)
  const onlineUserIds = new Set(getOnlineUserIds())

  return sendJsonResult(res, true, {
    generatedAt: new Date().toISOString(),
    user: toPublicUser(user, { onlineUserIds }),
    metrics: metricsByUserId[normalizedId] || createEmptyUsageMetrics(),
  })
})

exports.listUsers = asyncErrorHandler(async (req, res) => {
  const visibilityFilter = buildVisibilityFilter(req.user)
  const users = await UserModel.find(visibilityFilter)
    .select('_id memberId name team role isActive lastLogin createdAt updatedAt managedByUserId')
    .sort({ createdAt: -1, _id: -1 })
    .lean()

  const onlineUserIds = new Set(getOnlineUserIds())
  const ownerContext = await buildHierarchyOwnerContext(users)
  return sendJsonResult(
    res,
    true,
    users.map((user) =>
      toPublicUser(user, {
        onlineUserIds,
        ownerLookup: ownerContext.ownerLookup,
        teamManagerByName: ownerContext.teamManagerByName,
        superAdminOwnerId: ownerContext.superAdminOwnerId,
      })
    )
  )
})

exports.getUser = asyncErrorHandler(async (req, res) => {
  const { userId } = req.params
  const user = await findVisibleTargetUser(
    req.user,
    userId,
    '_id memberId name team role isActive lastLogin createdAt updatedAt email contactNumber avatarUrl avatarStorageKey avatarUpdatedAt managedByUserId'
  )

  if (!user) {
    return sendJsonResult(res, false, null, 'User not found', 404)
  }

  const onlineUserIds = new Set(getOnlineUserIds())
  return sendJsonResult(res, true, toPublicUser(user, { onlineUserIds, includeManageFields: true }))
})

exports.updateUser = asyncErrorHandler(async (req, res) => {
  const { userId } = req.params
  const body = req.body || {}
  const updates = {}

  const requesterId = toIdString(req.user?._id || req.user?.id)
  const targetUserId = toIdString(userId)
  const requesterRole = toRoleNumber(req.user?.role)

  const targetUser = await UserModel.findOne({ _id: userId })
    .select('_id role memberId name email team managedByUserId')
    .lean()

  if (!targetUser) {
    return sendJsonResult(res, false, null, 'User not found', 404)
  }

  const currentTargetRole = Number(targetUser.role)
  const existingGuestOwnerId = toIdString(targetUser.managedByUserId)

  const isSelfUpdate = requesterId && requesterId === targetUserId
  const isSuperAdminSelfMemberIdOnlyUpdate =
    requesterRole === RoleLevels.SUPER_ADMIN &&
    body.memberId !== undefined &&
    body.name === undefined &&
    body.email === undefined &&
    body.contactNumber === undefined &&
    body.avatarUrl === undefined &&
    body.avatarStorageKey === undefined &&
    body.team === undefined &&
    body.isActive === undefined &&
    body.role === undefined &&
    body.managedByUserId === undefined

  if (isSelfUpdate && !isSuperAdminSelfMemberIdOnlyUpdate) {
    return sendJsonResult(res, false, null, 'You cannot manage your own account from Admin', 403)
  }

  if (!isSelfUpdate && !canManageTargetUser(req.user, targetUser)) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  if (body.name !== undefined) {
    updates.name = String(body.name || '').trim()
    if (!updates.name) {
      return sendJsonResult(res, false, null, 'Name is required', 400)
    }
  }

  let requestedTeam = undefined
  if (body.team !== undefined) {
    if (!(requesterRole === RoleLevels.ADMIN || requesterRole === RoleLevels.SUPER_ADMIN)) {
      return sendJsonResult(res, false, null, 'Only admin can change team assignment', 403)
    }
    requestedTeam = normalizeTeamName(body.team)
  }

  if (body.email !== undefined) {
    const email = String(body.email || '').trim().toLowerCase()
    if (email && !EMAIL_REGEX.test(email)) {
      return sendJsonResult(res, false, null, 'Invalid email format', 400)
    }
    updates.email = email
  }

  if (body.contactNumber !== undefined) {
    const contactNumber = String(body.contactNumber || '').trim()
    if (contactNumber.length > 32) {
      return sendJsonResult(res, false, null, 'Contact number is too long', 400)
    }
    updates.contactNumber = contactNumber
  }

  if (body.avatarUrl !== undefined) {
    updates.avatarUrl = String(body.avatarUrl || '').trim()
    updates.avatarUpdatedAt = new Date()
  }

  if (body.avatarStorageKey !== undefined) {
    updates.avatarStorageKey = String(body.avatarStorageKey || '').trim()
  }

  if (body.isActive !== undefined) {
    updates.isActive = Boolean(body.isActive)
  }

  let parsedRole = null
  if (body.role !== undefined) {
    parsedRole = toRoleNumber(body.role)
    if (parsedRole === RoleLevels.SUPER_ADMIN) {
      return sendJsonResult(res, false, null, 'Super Admin role cannot be assigned from Admin page', 403)
    }
    if (parsedRole == null || !isValidManagedRole(parsedRole)) {
      return sendJsonResult(res, false, null, 'Invalid role', 400)
    }
    if (!actorCanManageRole(req.user, parsedRole)) {
      return sendJsonResult(res, false, null, 'You cannot assign this role', 403)
    }

    if (currentTargetRole === RoleLevels.GUEST && parsedRole !== RoleLevels.GUEST) {
      return sendJsonResult(
        res,
        false,
        null,
        'Guest role changes are currently disabled. Manage guest lifecycle from Your Guests tab.',
        400
      )
    }
    const demotingAssignedManager =
      currentTargetRole === RoleLevels.Manager && parsedRole !== RoleLevels.Manager
    if (demotingAssignedManager) {
      const managesAnyTeam = await TeamModel.exists({ managerUserId: targetUser._id })
      if (managesAnyTeam) {
        return sendJsonResult(
          res,
          false,
          null,
          'Cannot change role while user is assigned as team manager. Reassign the team manager first.',
          400
        )
      }
    }

    updates.role = parsedRole
  }

  const nextRole = parsedRole != null ? parsedRole : Number(targetUser.role)
  const userRoleActor = requesterRole === RoleLevels.User
  const managerRoleActor = requesterRole === RoleLevels.Manager
  const guestRoleTarget = nextRole === RoleLevels.GUEST

  if (body.managedByUserId !== undefined && !guestRoleTarget) {
    return sendJsonResult(res, false, null, 'Guest owner can only be set for guest accounts', 400)
  }

  if (guestRoleTarget) {
    let requestedOwnerId = toIdString(body.managedByUserId)

    if (userRoleActor) {
      if (requestedOwnerId && requestedOwnerId !== requesterId) {
        return sendJsonResult(res, false, null, 'User can assign guest ownership only to self', 403)
      }
      requestedOwnerId = requesterId
    } else if (!requestedOwnerId) {
      requestedOwnerId = existingGuestOwnerId || ''
    }

    if (!requestedOwnerId) {
      return sendJsonResult(res, false, null, 'Guest owner is required', 400)
    }

    const owner = await UserModel.findOne({ _id: requestedOwnerId })
      .select('_id role team isActive')
      .lean()

    const ownerRole = Number(owner?.role)
    if (!owner || !owner.isActive || !isValidGuestOwnerRole(ownerRole)) {
      return sendJsonResult(
        res,
        false,
        null,
        'managedByUserId must reference an active Super Admin, Admin, Manager, or User account',
        400
      )
    }

    if (managerRoleActor) {
      const actorTeam = normalizeTeamName(req.user?.team)
      const ownerTeam = normalizeTeamName(owner.team)
      if (!actorTeam || actorTeam !== ownerTeam) {
        return sendJsonResult(res, false, null, 'Manager can assign guest ownership only within their team', 403)
      }
    }

    updates.managedByUserId = owner._id
    updates.team = normalizeTeamName(owner.team)
    if (
      currentTargetRole !== RoleLevels.GUEST ||
      existingGuestOwnerId !== toIdString(owner._id)
    ) {
      updates.assignedProfileIds = []
    }

    if (requestedTeam !== undefined && requestedTeam !== updates.team) {
      return sendJsonResult(
        res,
        false,
        null,
        'Guest team is inherited from the owner team and cannot be set manually',
        400
      )
    }
  } else {
    if (requestedTeam !== undefined) {
      updates.team = requestedTeam
    }

    if (userRoleActor) {
      return sendJsonResult(res, false, null, 'User can manage only guest members', 403)
    }

    if (parsedRole != null && parsedRole !== RoleLevels.GUEST) {
      updates.managedByUserId = null
      updates.assignedProfileIds = []
    }
  }

  if (body.memberId !== undefined) {
    const normalizedMemberId = normalizeUserIdentifier(body.memberId)
    if (!isValidUserIdentifier(normalizedMemberId)) {
      return sendJsonResult(
        res,
        false,
        null,
        'Invalid user ID. Use 3-32 characters: A-Z, 0-9, underscore or hyphen.',
        400
      )
    }

    const duplicate = await UserModel.exists({
      _id: { $ne: targetUser._id },
      memberId: normalizedMemberId,
    })
    if (duplicate) {
      return sendJsonResult(res, false, null, 'User ID already exists', 400)
    }
    updates.memberId = normalizedMemberId
  }

  if (body.adminPassword !== undefined) {
    const stepUp = await verifyStepUpPassword(req, body.adminPassword)
    if (!stepUp.ok) {
      return sendJsonResult(res, false, null, stepUp.message, stepUp.status)
    }
  }

  if (
    updates.name &&
    updates.name !== String(targetUser.name || '') &&
    (await UserModel.exists({ name: updates.name, _id: { $ne: targetUser._id } }))
  ) {
    return sendJsonResult(res, false, null, 'Account name is already in use', 400)
  }

  if (
    updates.email !== undefined &&
    updates.email !== String(targetUser.email || '') &&
    updates.email &&
    (await UserModel.exists({ email: updates.email, _id: { $ne: targetUser._id } }))
  ) {
    return sendJsonResult(res, false, null, 'Email is already in use', 400)
  }

  if (Object.keys(updates).length === 0) {
    return sendJsonResult(res, false, null, 'No update fields provided', 400)
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: targetUser._id },
    { $set: updates },
    { returnDocument: 'after' }
  )
    .select(
      '_id memberId name team role isActive lastLogin createdAt updatedAt email contactNumber avatarUrl avatarStorageKey avatarUpdatedAt managedByUserId'
    )
    .lean()

  if (!updatedUser) {
    return sendJsonResult(res, false, null, 'User not found', 404)
  }

  const onlineUserIds = new Set(getOnlineUserIds())
  return sendJsonResult(
    res,
    true,
    toPublicUser(updatedUser, { onlineUserIds, includeManageFields: true }),
    'User updated'
  )
})

exports.createGuest = asyncErrorHandler(async (req, res) => {
  const actorId = toIdString(req.user?._id || req.user?.id)
  if (!actorId) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  const owner = await UserModel.findOne({ _id: actorId })
    .select('_id role team isActive')
    .lean()
  if (!owner || !owner.isActive || !isValidGuestOwnerRole(Number(owner.role))) {
    return sendJsonResult(
      res,
      false,
      null,
      'Only active Super Admin, Admin, Manager, or User accounts can create guests',
      403
    )
  }

  const body = req.body || {}
  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
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

  const guest = new UserModel({
    name,
    email,
    password,
    role: RoleLevels.GUEST,
    isActive: false,
    managedByUserId: owner._id,
    team: normalizeTeamName(owner.team),
  })
  await guest.save()

  const onlineUserIds = new Set(getOnlineUserIds())
  const ownerLookup = await buildOwnerLookup([owner._id])
  return sendJsonResult(
    res,
    true,
    toPublicUser(guest, { onlineUserIds, includeManageFields: true, ownerLookup }),
    'Guest user created',
    201
  )
})

exports.getGuestProfileAssignments = asyncErrorHandler(async (req, res) => {
  const { guestId } = req.params
  const { guest, error } = await findManagedGuest(
    req.user,
    guestId,
    '_id role team managedByUserId assignedProfileIds'
  )
  if (error) {
    return sendJsonResult(res, false, null, error.message, error.status)
  }

  const ownerUserId = toIdString(guest.managedByUserId)
  if (!ownerUserId) {
    return sendJsonResult(res, true, {
      guestId: toIdString(guest._id),
      ownerUserId: null,
      ownerName: '',
      ownerMemberId: '',
      assignedProfileIds: [],
      profiles: [],
    })
  }

  const [owner, profiles] = await Promise.all([
    UserModel.findOne({ _id: ownerUserId })
      .select('_id name memberId')
      .lean(),
    ProfileModel.find({ userId: ownerUserId })
      .select('_id fullName title mainStack defaultTemplateId status updatedAt')
      .sort({ updatedAt: -1 })
      .lean(),
  ])

  const assignedIdSet = new Set(normalizeObjectIdArray(guest.assignedProfileIds))
  const validAssignedProfileIds = []
  const profileDtos = (profiles || []).map((profile) => {
    const profileId = toIdString(profile._id)
    if (profileId && assignedIdSet.has(profileId)) {
      validAssignedProfileIds.push(profileId)
    }
    return toGuestAssignableProfileDto(profile, assignedIdSet)
  })

  return sendJsonResult(res, true, {
    guestId: toIdString(guest._id),
    ownerUserId,
    ownerName: String(owner?.name || '').trim(),
    ownerMemberId: String(owner?.memberId || '').trim(),
    assignedProfileIds: validAssignedProfileIds,
    profiles: profileDtos,
  })
})

exports.updateGuestProfileAssignments = asyncErrorHandler(async (req, res) => {
  const { guestId } = req.params
  if (!Array.isArray(req.body?.assignedProfileIds)) {
    return sendJsonResult(res, false, null, 'assignedProfileIds must be an array', 400)
  }

  const { guest, error } = await findManagedGuest(
    req.user,
    guestId,
    '_id role team managedByUserId assignedProfileIds'
  )
  if (error) {
    return sendJsonResult(res, false, null, error.message, error.status)
  }

  const ownerUserId = toIdString(guest.managedByUserId)
  const requestedProfileIds = normalizeObjectIdArray(req.body.assignedProfileIds)
  if (requestedProfileIds.length > 0 && !ownerUserId) {
    return sendJsonResult(
      res,
      false,
      null,
      'Guest owner is required before assigning profiles',
      400
    )
  }

  const matchingProfiles = requestedProfileIds.length > 0
    ? await ProfileModel.find({
        _id: { $in: requestedProfileIds },
        userId: ownerUserId,
      })
        .select('_id')
        .lean()
    : []

  const matchingIdSet = new Set(
    (matchingProfiles || []).map((profile) => toIdString(profile._id)).filter(Boolean)
  )
  const hasInvalidSelection = requestedProfileIds.some((profileId) => !matchingIdSet.has(profileId))
  if (hasInvalidSelection) {
    return sendJsonResult(
      res,
      false,
      null,
      'Assigned profiles must belong to the guest owner',
      400
    )
  }

  const orderedAssignedProfileIds = requestedProfileIds.filter((profileId) =>
    matchingIdSet.has(profileId)
  )

  const updatedGuest = await UserModel.findOneAndUpdate(
    { _id: guest._id },
    { $set: { assignedProfileIds: orderedAssignedProfileIds } },
    { returnDocument: 'after' }
  )
    .select('_id assignedProfileIds')
    .lean()

  return sendJsonResult(
    res,
    true,
    {
      guestId: toIdString(updatedGuest?._id || guest._id),
      assignedProfileIds: normalizeObjectIdArray(
        updatedGuest?.assignedProfileIds || orderedAssignedProfileIds
      ),
    },
    'Guest profile assignments updated'
  )
})

exports.deleteGuest = asyncErrorHandler(async (req, res) => {
  const { guestId } = req.params
  const guest = await UserModel.findOne({ _id: guestId })
    .select('_id role team managedByUserId')
    .lean()
  if (!guest || Number(guest.role) !== RoleLevels.GUEST) {
    return sendJsonResult(res, false, null, 'Guest not found', 404)
  }

  if (!canManageTargetUser(req.user, guest)) {
    return sendJsonResult(res, false, null, 'Insufficient permission', 403)
  }

  await UserModel.deleteOne({ _id: guest._id })
  return sendJsonResult(
    res,
    true,
    { userId: toIdString(guest._id) },
    'Guest deleted'
  )
})

exports.deleteUser = asyncErrorHandler(async (req, res) => {
  const { userId } = req.params
  const requesterId = toIdString(req.user?._id || req.user?.id)
  const targetUserId = toIdString(userId)

  if (requesterId && targetUserId && requesterId === targetUserId) {
    return sendJsonResult(
      res,
      false,
      null,
      'You cannot permanently delete your own account.',
      403
    )
  }

  const targetUser = await UserModel.findOne({ _id: userId })
    .select('_id role team managedByUserId name email memberId')
    .lean()
  if (!targetUser) {
    return sendJsonResult(res, false, null, 'User not found', 404)
  }

  const stepUp = await verifyStepUpPassword(req, req.body?.adminPassword)
  if (!stepUp.ok) {
    return sendJsonResult(res, false, null, stepUp.message, stepUp.status)
  }

  if (Number(targetUser.role) === RoleLevels.SUPER_ADMIN) {
    const superAdminCount = await UserModel.countDocuments({
      role: RoleLevels.SUPER_ADMIN,
    })
    if (superAdminCount <= 1) {
      return sendJsonResult(
        res,
        false,
        null,
        'Cannot delete the last Super Admin account.',
        400
      )
    }
  }

  const [managesAnyTeam, ownsGuests] = await Promise.all([
    TeamModel.exists({ managerUserId: targetUser._id }),
    UserModel.exists({ role: RoleLevels.GUEST, managedByUserId: targetUser._id }),
  ])

  if (managesAnyTeam) {
    return sendJsonResult(
      res,
      false,
      null,
      'Cannot delete user while they are assigned as a team manager. Reassign the team manager first.',
      400
    )
  }

  if (ownsGuests) {
    return sendJsonResult(
      res,
      false,
      null,
      'Cannot delete user while they still own guest accounts. Reassign or delete those guests first.',
      400
    )
  }

  const deleted = await deleteOwnedUserData(targetUser._id)
  const deleteResult = await UserModel.deleteOne({ _id: targetUser._id })
  if (!deleteResult?.deletedCount) {
    return sendJsonResult(res, false, null, 'User not found', 404)
  }

  return sendJsonResult(
    res,
    true,
    {
      userId: toIdString(targetUser._id),
      deleted,
    },
    'User permanently deleted'
  )
})

exports.resetUserPassword = asyncErrorHandler(async (req, res) => {
  const { userId } = req.params
  const { newPassword, confirmPassword, adminPassword } = req.body || {}

  const result = await resetUserPasswordCore({
    req,
    targetUserId: userId,
    newPassword,
    confirmPassword,
    adminPassword,
  })

  if (!result.ok) {
    return sendJsonResult(res, false, null, result.message, result.status)
  }
  return sendJsonResult(res, true, null, result.message)
})
