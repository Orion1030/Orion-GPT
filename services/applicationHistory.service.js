const { ApplicationModel, ApplicationEventModel } = require('../dbModels')

async function appendApplicationHistory({
  applicationId,
  userId,
  eventType,
  actorType = 'system',
  actorId = null,
  payload = {},
  requestId = null,
  source = 'system',
  eventVersion = 1,
  createdAt = null,
}) {
  const appId = String(applicationId)
  if (!appId) throw new Error('applicationId is required')
  if (!eventType) throw new Error('eventType is required')

  if (requestId) {
    const existing = await ApplicationEventModel.findOne({
      applicationId: appId,
      'meta.requestId': requestId,
    })
      .lean()
    if (existing) return existing
  }

  const query = userId
    ? { _id: appId, userId }
    : { _id: appId }

  const app = await ApplicationModel.findOneAndUpdate(
    query,
    {
      $inc: { historySequence: 1 },
      $set: { lastActivityAt: new Date() },
    },
    {
      returnDocument: 'after',
      projection: { _id: 1, userId: 1, historySequence: 1 },
    }
  ).lean()

  if (!app) {
    throw new Error('Application not found while appending history')
  }

  const eventDocument = {
    userId: app.userId,
    applicationId: app._id,
    eventType,
    actorType,
    actorId: actorId || null,
    payload: payload || {},
    meta: {
      requestId: requestId || null,
      source: source || 'system',
      eventVersion: Number(eventVersion || 1),
      sequence: Number(app.historySequence || 1),
    },
  }

  if (createdAt) {
    eventDocument.createdAt = createdAt
  }

  try {
    const created = await ApplicationEventModel.create(eventDocument)
    return created.toObject()
  } catch (error) {
    const duplicateKey = error?.code === 11000
    if (!duplicateKey || !requestId) throw error

    const existing = await ApplicationEventModel.findOne({
      applicationId: appId,
      'meta.requestId': requestId,
    }).lean()
    if (existing) return existing
    throw error
  }
}

async function listApplicationHistory({
  applicationId,
  userId,
  page = 1,
  pageSize = 50,
}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1)
  const safePageSize = Math.max(1, Math.min(200, Number.parseInt(pageSize, 10) || 50))
  const skip = (safePage - 1) * safePageSize

  const appQuery = userId
    ? { _id: applicationId, userId }
    : { _id: applicationId }

  const app = await ApplicationModel.findOne(appQuery).select('_id').lean()
  if (!app) return null

  const filter = { applicationId: app._id }
  const [items, total] = await Promise.all([
    ApplicationEventModel.find(filter)
      .sort({ createdAt: -1, 'meta.sequence': -1 })
      .skip(skip)
      .limit(safePageSize)
      .lean(),
    ApplicationEventModel.countDocuments(filter),
  ])

  return {
    items: items || [],
    page: safePage,
    pageSize: safePageSize,
    total: Number(total || 0),
  }
}

module.exports = {
  appendApplicationHistory,
  listApplicationHistory,
}

