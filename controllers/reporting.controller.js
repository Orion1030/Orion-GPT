const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { ApplicationModel, UserModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')
const { RoleLevels } = require('../utils/constants')

exports.getReport = asyncErrorHandler(async (req, res) => {
  const { user } = req
  const { days = 30 } = req.query

  const since = new Date()
  since.setDate(since.getDate() - Number(days))

  // Admins/Managers see all users; regular users see only themselves
  const userFilter = user.role === RoleLevels.User
    ? [user._id]
    : (await UserModel.find({ isActive: true }).select('_id')).map(u => u._id)

  const applications = await ApplicationModel.find({
    userId: { $in: userFilter },
    createdAt: { $gte: since },
  }).lean()

  const resolveStatus = (app) => app.applicationStatus || app.status || 'unknown'

  // Aggregate by status
  const byStatus = applications.reduce((acc, app) => {
    const status = resolveStatus(app)
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  // Aggregate by date
  const byDate = applications.reduce((acc, app) => {
    const date = new Date(app.createdAt).toISOString().split('T')[0]
    acc[date] = (acc[date] || 0) + 1
    return acc
  }, {})

  // Aggregate by user (for admins/managers)
  const byUser = {}
  if (user.role !== RoleLevels.User) {
    for (const app of applications) {
      const uid = String(app.userId)
      if (!byUser[uid]) byUser[uid] = { total: 0, byStatus: {} }
      byUser[uid].total++
      const status = resolveStatus(app)
      byUser[uid].byStatus[status] = (byUser[uid].byStatus[status] || 0) + 1
    }
  }

  sendJsonResult(res, true, {
    total: applications.length,
    days: Number(days),
    byStatus,
    byDate,
    byUser: user.role !== RoleLevels.User ? byUser : undefined,
  })
})
