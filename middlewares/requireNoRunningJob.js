/**
 * Middleware factory that rejects with 503 if the user already has an active job.
 *
 * requireNoRunningJob          — blocks if any job is pending/running (used on job creation)
 * requireNoRunningJobOfType(   — blocks only if a job of one of the given types is active
 *   'parse_jd', 'generate_resume', ...
 * )
 */
const { JobModel } = require('../dbModels')

function buildMiddleware(types) {
  return async function (req, res, next) {
    const userId = req.user?._id
    if (!userId) return next()

    try {
      const query = { userId, status: { $in: ['pending', 'running'] } }
      if (types && types.length > 0) query.type = { $in: types }

      const running = await JobModel.findOne(query).lean()
      if (running) {
        return res.status(503).json({
          success: false,
          data: null,
          message: 'A job is already in progress. Please wait for it to complete.',
        })
      }
      next()
    } catch (e) {
      next(e)
    }
  }
}

/** Blocks if any job is active (use on POST /agent/jobs to prevent queue stacking). */
const requireNoRunningJob = buildMiddleware(null)

/** Blocks only if a job of one of the specified types is active. */
function requireNoRunningJobOfType(...types) {
  return buildMiddleware(types)
}

module.exports = { requireNoRunningJob, requireNoRunningJobOfType }
