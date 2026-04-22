const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { UserModel } = require('../dbModels')
const { RoleLevels } = require('../utils/constants')
const { buildUsageMetricsMap, createEmptyUsageMetrics } = require('../services/usageMetrics.service')
const { verifyRequesterPassword } = require('../services/auth.service')
const { getOnlineUserIds, isUserOnline } = require('../realtime/socketServer')
const {
  buildDefaultUserIdentifierFromObjectId,
  isValidUserIdentifier,
  normalizeUserIdentifier,
} = require('../utils/userIdentifier')
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

function toPublicUser(user, options = {}) {
  const userId = String(user._id)
  const onlineUserIds = options.onlineUserIds instanceof Set ? options.onlineUserIds : null
  const isOnline = onlineUserIds ? onlineUserIds.has(userId) : isUserOnline(userId)
  const memberId = String(user.memberId || '').trim() || buildDefaultUserIdentifierFromObjectId(user._id)
  const includeManageFields = Boolean(options.includeManageFields)

  const dto = {
    id: userId,
    memberId,
    name: user.name || '',
    team: user.team || '',
    role: Number(user.role),
    roleLabel: toRoleLabel(user.role),
    isActive: Boolean(user.isActive),
    isOnline,
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  }

  if (includeManageFields) {
    dto.email = user.email || ''
    dto.contactNumber = user.contactNumber || ''
    dto.avatarUrl = user.avatarUrl || ''
    dto.avatarStorageKey = user.avatarStorageKey || ''
    dto.avatarUpdatedAt = user.avatarUpdatedAt || null
  }

  return dto
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

function toRoleNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isValidManagedRole(role) {
  return (
    role === RoleLevels.ADMIN ||
    role === RoleLevels.Manager ||
    role === RoleLevels.User ||
    role === RoleLevels.GUEST
  )
}

function isAdminTierRole(role) {
  return Number(role) === RoleLevels.ADMIN || Number(role) === RoleLevels.SUPER_ADMIN
}

function buildAdminVisibleUserFilter(requesterRole) {
  if (Number(requesterRole) === RoleLevels.ADMIN) {
    return { role: { $ne: RoleLevels.SUPER_ADMIN } }
  }
  return {}
}

async function resetUserPasswordCore({
  req,
  requesterRole,
  targetUserId,
  newPassword,
  confirmPassword,
  adminPassword,
}) {
  const adminPasswordVerified = await verifyRequesterPassword(req, adminPassword)
  if (!adminPasswordVerified) {
    return { ok: false, status: 401, message: 'Admin password verification failed' }
  }

  const visibilityFilter = buildAdminVisibleUserFilter(requesterRole)
  const user = await UserModel.findOne({ _id: targetUserId, ...visibilityFilter })
  if (!user) {
    return { ok: false, status: 404, message: 'User not found' }
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

  user.password = normalizedPassword
  await user.save()
  return { ok: true, status: 200, message: 'Password reset successfully' }
}

exports.changeMemberPassword = asyncErrorHandler(async (req, res, next) => {
  const { newPassword, confirmPassword, memberId, adminPassword } = req.body || {}
  if (!memberId) {
    return sendJsonResult(res, false, null, 'User not found', 400)
  }
  const result = await resetUserPasswordCore({
    req,
    requesterRole: req.user?.role,
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
exports.allowMember = asyncErrorHandler(async (req, res, next) => {
  const { userId } = req.body
  const user = await UserModel.findOne({ _id: userId })
  if (!user) {
    return sendJsonResult(res, false, null, 'User not found', 400)
  }
  user.isActive = true
  await user.save()
  return sendJsonResult(res, true, null, 'User Activated successfully')
})

exports.getUsageMetrics = asyncErrorHandler(async (req, res) => {
  const visibilityFilter = buildAdminVisibleUserFilter(req.user?.role)
  const users = await UserModel.find(visibilityFilter)
    .select('_id memberId name team role isActive lastLogin createdAt')
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

  const visibilityFilter = buildAdminVisibleUserFilter(req.user?.role)
  const user = await UserModel.findOne({ _id: userId, ...visibilityFilter })
    .select('_id memberId name team role isActive lastLogin createdAt')
    .lean()

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
  const visibilityFilter = buildAdminVisibleUserFilter(req.user?.role)
  const users = await UserModel.find(visibilityFilter)
    .select('_id memberId name team role isActive lastLogin createdAt updatedAt')
    .sort({ createdAt: -1, _id: -1 })
    .lean()
  const onlineUserIds = new Set(getOnlineUserIds())

  return sendJsonResult(res, true, users.map((user) => toPublicUser(user, { onlineUserIds })))
})

exports.getUser = asyncErrorHandler(async (req, res) => {
  const { userId } = req.params
  const visibilityFilter = buildAdminVisibleUserFilter(req.user?.role)
  const user = await UserModel.findOne({ _id: userId, ...visibilityFilter })
    .select(
      '_id memberId name team role isActive lastLogin createdAt updatedAt email contactNumber avatarUrl avatarStorageKey avatarUpdatedAt'
    )
    .lean()

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
  const requesterId = String(req.user?._id || '')
  const targetUserId = String(userId || '')

  const requesterRole = Number(req.user?.role)
  const targetUser = await UserModel.findOne({ _id: userId })
    .select('_id role memberId name email')
    .lean()

  if (!targetUser) {
    return sendJsonResult(res, false, null, 'User not found', 404)
  }

  const isSelfUpdate = requesterId && requesterId === targetUserId
  if (isSelfUpdate) {
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
      body.role === undefined

    if (!isSuperAdminSelfMemberIdOnlyUpdate) {
      return sendJsonResult(res, false, null, 'You cannot manage your own account from Admin', 403)
    }
  }

  // Admins cannot manage admin-tier accounts or promote users to admin-tier roles.
  if (requesterRole === RoleLevels.ADMIN) {
    if (isAdminTierRole(targetUser.role)) {
      return sendJsonResult(
        res,
        false,
        null,
        'Admin cannot manage Admin or Super Admin accounts',
        403
      )
    }
    if (body.role !== undefined) {
      const requestedRole = toRoleNumber(body.role)
      if (isAdminTierRole(requestedRole)) {
        return sendJsonResult(
          res,
          false,
          null,
          'Admin cannot assign Admin or Super Admin role',
          403
        )
      }
    }
  }

  if (body.name !== undefined) {
    updates.name = String(body.name || '').trim()
    if (!updates.name) {
      return sendJsonResult(res, false, null, 'Name is required', 400)
    }
  }

  if (body.team !== undefined) {
    updates.team = String(body.team || '').trim()
  }

  const includesSensitiveManageFields =
    body.name !== undefined ||
    body.email !== undefined ||
    body.contactNumber !== undefined ||
    body.avatarUrl !== undefined ||
    body.avatarStorageKey !== undefined ||
    body.team !== undefined ||
    body.role !== undefined ||
    body.isActive !== undefined

  if (includesSensitiveManageFields) {
    const adminPasswordVerified = await verifyRequesterPassword(req, body.adminPassword)
    if (!adminPasswordVerified) {
      return sendJsonResult(res, false, null, 'Admin password verification failed', 401)
    }
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

  if (body.role !== undefined) {
    const parsedRole = toRoleNumber(body.role)
    if (parsedRole === RoleLevels.SUPER_ADMIN) {
      return sendJsonResult(
        res,
        false,
        null,
        'Super Admin role cannot be assigned from Admin page',
        403
      )
    }
    if (parsedRole == null || !isValidManagedRole(parsedRole)) {
      return sendJsonResult(res, false, null, 'Invalid role', 400)
    }
    updates.role = parsedRole
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
      '_id memberId name team role isActive lastLogin createdAt updatedAt email contactNumber avatarUrl avatarStorageKey avatarUpdatedAt'
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

exports.resetUserPassword = asyncErrorHandler(async (req, res) => {
  const { userId } = req.params
  const { newPassword, confirmPassword, adminPassword } = req.body || {}

  const result = await resetUserPasswordCore({
    req,
    requesterRole: req.user?.role,
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
