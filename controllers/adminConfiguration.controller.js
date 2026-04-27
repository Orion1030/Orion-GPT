const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const {
  getAiConfigurationForOwner,
  upsertAiConfigurationForOwner,
} = require('../services/adminConfiguration.service')
const {
  listAiProviderCatalog,
  toProviderCatalogDto,
  upsertAiProviderCatalogEntry,
} = require('../services/aiProviderCatalog.service')
const { RoleLevels } = require('../utils/constants')

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

exports.getAiProviderCatalog = asyncErrorHandler(async (req, res) => {
  const includeInactive = Number(req.user?.role) === Number(RoleLevels.SUPER_ADMIN)
  const rows = await listAiProviderCatalog({ includeInactive })
  return sendJsonResult(res, true, rows.map(toProviderCatalogDto))
})

exports.upsertAiProviderCatalog = asyncErrorHandler(async (req, res) => {
  const providerKey = req.params?.providerKey
  const result = await upsertAiProviderCatalogEntry({
    providerKey,
    label: req.body?.label,
    isActive: req.body?.isActive,
    sortOrder: req.body?.sortOrder,
    models: req.body?.models,
    actorUserId: req.user?._id || null,
  })
  if (!result.ok) {
    return sendJsonResult(res, false, null, result.message, result.status)
  }
  return sendJsonResult(res, true, result.data, result.message, 200)
})
