const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const {
  getAiConfigurationForOwner,
  upsertAiConfigurationForOwner,
} = require('../services/adminConfiguration.service')

exports.getMyAiConfiguration = asyncErrorHandler(async (req, res) => {
  const ownerUserId = req.user?._id
  const data = await getAiConfigurationForOwner(ownerUserId)
  return sendJsonResult(res, true, data)
})

exports.upsertMyAiConfiguration = asyncErrorHandler(async (req, res) => {
  const ownerUserId = req.user?._id
  const actorUserId = req.user?._id
  const result = await upsertAiConfigurationForOwner({
    ownerUserId,
    actorUserId,
    payload: req.body || {},
  })
  if (!result.ok) {
    return sendJsonResult(res, false, null, result.message, result.status)
  }
  return sendJsonResult(res, true, result.data, result.message, 200)
})
