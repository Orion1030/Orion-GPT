/**
 * Reject the request with 503 if the user has any job in 'pending' or 'running' state.
 * Prevents the frontend from sending duplicate or conflicting requests while backend is working.
 */
const { JobModel } = require('../dbModels')

async function requireNoRunningJob(req, res, next) {
  const userId = req.user?._id
  if (!userId) return next()

  try {
    const running = await JobModel.findOne({
      userId,
      status: { $in: ['pending', 'running'] }
    }).lean()
    if (running) {
      return res.status(503).json({
        success: false,
        data: null,
        message: 'A job is already in progress. Please wait for it to complete.'
      })
    }
    next()
  } catch (e) {
    next(e)
  }
}

module.exports = { requireNoRunningJob }
