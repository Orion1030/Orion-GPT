const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { UserModel } = require('../dbModels')
const { RoleLevels } = require('../utils/constants')
const { buildUsageMetricsMap, createEmptyUsageMetrics } = require('../services/usageMetrics.service')

function toRoleLabel(role) {
  const normalized = Number(role)
  if (normalized === RoleLevels.SUPER_ADMIN) return 'Super Admin'
  if (normalized === RoleLevels.ADMIN) return 'Admin'
  if (normalized === RoleLevels.Manager) return 'Manager'
  if (normalized === RoleLevels.User) return 'User'
  return 'Guest'
}

function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name || '',
    team: user.team || '',
    role: Number(user.role),
    roleLabel: toRoleLabel(user.role),
    isActive: Boolean(user.isActive),
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt || null,
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

exports.changeMemberPassword = asyncErrorHandler(async (req, res, next) => {
  const { newPassword, confirmPassword, oldPassword, memberId } = req.body
  const user = await UserModel.findOne({ _id: memberId })
  if (!user) {
    return sendJsonResult(res, false, null, 'User not found', 400)
  }
  if (!newPassword) return sendJsonResult(res, false, null, 'Enter new password', 400)
  if (newPassword !== confirmPassword) return sendJsonResult(res, false, null, "New password and confirm password doesn't match", 400)
  const isPasswordMatched = await user.comparePassword(oldPassword)
  if (isPasswordMatched) user.password = newPassword
  else {
    return sendJsonResult(res, false, null, 'Incorrect old password', 400)
  }
  await user.save()
  return sendJsonResult(res, true, null, 'Password changed successfully')
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
    .select('_id name team role isActive lastLogin createdAt')
    .sort({ name: 1, createdAt: 1 })
    .lean()

  const metricsByUserId = await buildUsageMetricsMap({ userIds: users.map((user) => user._id) })

  const rows = users.map((user) => {
    const userId = String(user._id)
    return {
      user: toPublicUser(user),
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
    .select('_id name team role isActive lastLogin createdAt')
    .lean()

  if (!user) {
    return sendJsonResult(res, false, null, 'User not found', 404)
  }

  const metricsByUserId = await buildUsageMetricsMap({ userIds: [user._id] })
  const normalizedId = String(user._id)

  return sendJsonResult(res, true, {
    generatedAt: new Date().toISOString(),
    user: toPublicUser(user),
    metrics: metricsByUserId[normalizedId] || createEmptyUsageMetrics(),
  })
})

exports.listUsers = asyncErrorHandler(async (req, res) => {
  const visibilityFilter = buildAdminVisibleUserFilter(req.user?.role)
  const users = await UserModel.find(visibilityFilter)
    .select('_id name team role isActive lastLogin createdAt updatedAt')
    .sort({ name: 1, createdAt: 1 })
    .lean()

  return sendJsonResult(res, true, users.map(toPublicUser))
})

exports.updateUser = asyncErrorHandler(async (req, res) => {
  const { userId } = req.params
  const body = req.body || {}
  const updates = {}
  const requesterId = String(req.user?._id || '')
  const targetUserId = String(userId || '')

  const requesterRole = Number(req.user?.role)
  const targetUser = await UserModel.findOne({ _id: userId }).select('_id role').lean()

  if (!targetUser) {
    return sendJsonResult(res, false, null, 'User not found', 404)
  }

  if (requesterId && requesterId === targetUserId) {
    return sendJsonResult(res, false, null, 'You cannot manage your own account from Admin', 403)
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

  if (Object.keys(updates).length === 0) {
    return sendJsonResult(res, false, null, 'No update fields provided', 400)
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: targetUser._id },
    { $set: updates },
    { returnDocument: 'after' }
  )
    .select('_id name team role isActive lastLogin createdAt updatedAt')
    .lean()

  if (!updatedUser) {
    return sendJsonResult(res, false, null, 'User not found', 404)
  }

  return sendJsonResult(res, true, toPublicUser(updatedUser), 'User updated')
})
