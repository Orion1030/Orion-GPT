const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { UserModel } = require('../dbModels')
const { RoleLevels } = require('../utils/constants')
const { buildUsageMetricsMap, createEmptyUsageMetrics } = require('../services/usageMetrics.service')

function toRoleLabel(role) {
  const normalized = Number(role)
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
  return role === RoleLevels.ADMIN || role === RoleLevels.Manager || role === RoleLevels.User || role === RoleLevels.GUEST
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
  const users = await UserModel.find({})
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

  const user = await UserModel.findOne({ _id: userId })
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
  const users = await UserModel.find({})
    .select('_id name team role isActive lastLogin createdAt updatedAt')
    .sort({ name: 1, createdAt: 1 })
    .lean()

  return sendJsonResult(res, true, users.map(toPublicUser))
})

exports.updateUser = asyncErrorHandler(async (req, res) => {
  const { userId } = req.params
  const updates = {}

  if (req.body?.name !== undefined) {
    updates.name = String(req.body.name || '').trim()
    if (!updates.name) {
      return sendJsonResult(res, false, null, 'Name is required', 400)
    }
  }

  if (req.body?.team !== undefined) {
    updates.team = String(req.body.team || '').trim()
  }

  if (req.body?.isActive !== undefined) {
    updates.isActive = Boolean(req.body.isActive)
  }

  if (req.body?.role !== undefined) {
    const parsedRole = toRoleNumber(req.body.role)
    if (parsedRole == null || !isValidManagedRole(parsedRole)) {
      return sendJsonResult(res, false, null, 'Invalid role', 400)
    }
    updates.role = parsedRole
  }

  if (Object.keys(updates).length === 0) {
    return sendJsonResult(res, false, null, 'No update fields provided', 400)
  }

  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: userId },
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
