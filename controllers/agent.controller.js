require('dotenv').config()
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { JobModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

/** Create a new agent job */
exports.createJob = asyncErrorHandler(async (req, res) => {
  const { type, payload } = req.body || {}
  if (!type) return sendJsonResult(res, false, null, 'Job type is required', 400)
  const job = new JobModel({ userId: req.user._id, type, payload: payload || {}, status: 'pending' })
  await job.save()
  return sendJsonResult(res, true, { jobId: job._id.toString() }, null, 201)
})

/** Get job status/result */
exports.getJob = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { jobId } = req.params
  const job = await JobModel.findOne({ _id: jobId, userId }).lean()
  if (!job) return sendJsonResult(res, false, null, 'Job not found', 404)
  return sendJsonResult(res, true, job, null, 200)
})

/** Stream job status via Server-Sent Events (replaces client polling) */
exports.streamJobEvents = async (req, res) => {
  const userId = req.user._id
  const { jobId } = req.params

  const job = await JobModel.findOne({ _id: jobId, userId }).lean()
  if (!job) {
    return res.status(404).json({ success: false, message: 'Job not found' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Send current state immediately
  sendEvent({ status: job.status, progress: job.progress, result: job.result, error: job.error })

  // If already terminal, close immediately
  if (TERMINAL_STATUSES.has(job.status)) {
    return res.end()
  }

  // Poll DB and push updates
  const interval = setInterval(async () => {
    try {
      const updated = await JobModel.findOne({ _id: jobId, userId }).lean()
      if (!updated) {
        clearInterval(interval)
        return res.end()
      }
      sendEvent({ status: updated.status, progress: updated.progress, result: updated.result, error: updated.error })
      if (TERMINAL_STATUSES.has(updated.status)) {
        clearInterval(interval)
        res.end()
      }
    } catch {
      clearInterval(interval)
      res.end()
    }
  }, 1500)

  req.on('close', () => clearInterval(interval))
}

/** Cancel job */
exports.cancelJob = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { jobId } = req.params
  const job = await JobModel.findOneAndUpdate({ _id: jobId, userId }, { $set: { status: 'cancelled' } }, { new: true }).lean()
  if (!job) return sendJsonResult(res, false, null, 'Job not found', 404)
  return sendJsonResult(res, true, job, 'Job cancelled', 200)
})

