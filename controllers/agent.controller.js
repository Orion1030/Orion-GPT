require('dotenv').config()
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { JobModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')

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

/** Cancel job */
exports.cancelJob = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { jobId } = req.params
  const job = await JobModel.findOneAndUpdate({ _id: jobId, userId }, { $set: { status: 'cancelled' } }, { new: true }).lean()
  if (!job) return sendJsonResult(res, false, null, 'Job not found', 404)
  return sendJsonResult(res, true, job, 'Job cancelled', 200)
})

