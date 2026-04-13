const mongoose = require('mongoose')
const {
  ProfileModel,
  ResumeModel,
  JobDescriptionModel,
  ChatSessionModel,
  ChatMessageModel,
  ApplicationModel,
  ApplicationEventModel,
} = require('../dbModels')

function toIdString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value.toString === 'function') return value.toString()
  return String(value)
}

function toObjectId(value) {
  if (!value) return null
  if (value instanceof mongoose.Types.ObjectId) return value
  const raw = String(value).trim()
  if (!mongoose.Types.ObjectId.isValid(raw)) return null
  return new mongoose.Types.ObjectId(raw)
}

function normalizeUserObjectIds(userIds) {
  if (!Array.isArray(userIds)) return []
  const dedup = new Set()
  const out = []
  for (const id of userIds) {
    const objectId = toObjectId(id)
    if (!objectId) continue
    const key = objectId.toHexString()
    if (dedup.has(key)) continue
    dedup.add(key)
    out.push(objectId)
  }
  return out
}

function createEmptyUsageMetrics() {
  return {
    llmUsage: {
      estimatedCallCount: 0,
      chatReplyCount: 0,
      jdParseCount: 0,
      resumeGenerationCount: 0,
    },
    profileCount: 0,
    resume: {
      count: 0,
      downloadCount: 0,
      downloadPdfCount: 0,
      downloadDocxCount: 0,
      jdAppliedCount: 0,
    },
    chat: {
      sessionCount: 0,
      totalMessages: 0,
      userMessages: 0,
      assistantMessages: 0,
    },
    applications: {
      total: 0,
      status: {
        inProgress: 0,
        applied: 0,
        declined: 0,
        cancelled: 0,
      },
      generation: {
        pending: 0,
        queued: 0,
        running: 0,
        active: 0,
        completed: 0,
        failed: 0,
      },
    },
  }
}

function ensureMetrics(metricsByUserId, userId) {
  const id = toIdString(userId)
  if (!id) return null
  if (!metricsByUserId[id]) {
    metricsByUserId[id] = createEmptyUsageMetrics()
  }
  return metricsByUserId[id]
}

function buildMatch(field, userObjectIds) {
  if (!userObjectIds.length) return null
  return { [field]: { $in: userObjectIds } }
}

function finalizeLlmMetrics(metricsByUserId) {
  for (const metrics of Object.values(metricsByUserId)) {
    const chatReplyCount = Number(metrics?.chat?.assistantMessages || 0)
    const jdParseCount = Number(metrics?.llmUsage?.jdParseCount || 0)
    const resumeGenerationCount = Number(metrics?.applications?.generation?.completed || 0)

    metrics.llmUsage.chatReplyCount = chatReplyCount
    metrics.llmUsage.resumeGenerationCount = resumeGenerationCount
    metrics.llmUsage.estimatedCallCount = chatReplyCount + jdParseCount + resumeGenerationCount
  }
}

async function buildUsageMetricsMap({ userIds = null } = {}) {
  const hasExplicitUserFilter = Array.isArray(userIds)
  const userObjectIds = normalizeUserObjectIds(userIds)
  if (hasExplicitUserFilter && userObjectIds.length === 0) {
    return {}
  }
  const metricsByUserId = {}

  for (const userObjectId of userObjectIds) {
    ensureMetrics(metricsByUserId, userObjectId)
  }

  const profileMatch = hasExplicitUserFilter ? buildMatch('userId', userObjectIds) : null
  const resumeMatch = hasExplicitUserFilter ? buildMatch('userId', userObjectIds) : null
  const jdMatch = hasExplicitUserFilter ? buildMatch('userId', userObjectIds) : null
  const chatSessionMatch = hasExplicitUserFilter ? buildMatch('userId', userObjectIds) : null
  const appMatch = hasExplicitUserFilter ? buildMatch('userId', userObjectIds) : null
  const downloadMatch = hasExplicitUserFilter ? buildMatch('userId', userObjectIds) : null
  const chatMessageOwnerMatch = hasExplicitUserFilter ? buildMatch('session.userId', userObjectIds) : null

  const [
    profileRows,
    resumeRows,
    jobDescriptionRows,
    chatSessionRows,
    chatMessageRows,
    applicationRows,
    downloadRows,
  ] = await Promise.all([
    ProfileModel.aggregate([
      ...(profileMatch ? [{ $match: profileMatch }] : []),
      { $group: { _id: '$userId', profileCount: { $sum: 1 } } },
    ]),
    ResumeModel.aggregate([
      ...(resumeMatch ? [{ $match: { ...resumeMatch, isDeleted: { $ne: true } } }] : [{ $match: { isDeleted: { $ne: true } } }]),
      { $group: { _id: '$userId', resumeCount: { $sum: 1 } } },
    ]),
    JobDescriptionModel.aggregate([
      ...(jdMatch ? [{ $match: jdMatch }] : []),
      { $group: { _id: '$userId', jdParseCount: { $sum: 1 } } },
    ]),
    ChatSessionModel.aggregate([
      ...(chatSessionMatch ? [{ $match: chatSessionMatch }] : []),
      { $group: { _id: '$userId', sessionCount: { $sum: 1 } } },
    ]),
    ChatMessageModel.aggregate([
      {
        $lookup: {
          from: ChatSessionModel.collection.name,
          localField: 'sessionId',
          foreignField: '_id',
          as: 'session',
        },
      },
      { $unwind: '$session' },
      ...(chatMessageOwnerMatch ? [{ $match: chatMessageOwnerMatch }] : []),
      {
        $group: {
          _id: '$session.userId',
          totalMessages: { $sum: 1 },
          userMessages: {
            $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] },
          },
          assistantMessages: {
            $sum: { $cond: [{ $eq: ['$role', 'assistant'] }, 1, 0] },
          },
        },
      },
    ]),
    ApplicationModel.aggregate([
      ...(appMatch ? [{ $match: appMatch }] : []),
      {
        $group: {
          _id: '$userId',
          totalApplications: { $sum: 1 },
          inProgressCount: {
            $sum: { $cond: [{ $eq: ['$applicationStatus', 'in_progress'] }, 1, 0] },
          },
          appliedCount: {
            $sum: { $cond: [{ $eq: ['$applicationStatus', 'applied'] }, 1, 0] },
          },
          declinedCount: {
            $sum: { $cond: [{ $eq: ['$applicationStatus', 'declined'] }, 1, 0] },
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ['$applicationStatus', 'cancelled'] }, 1, 0] },
          },
          jdAppliedCount: {
            $sum: {
              $cond: [
                { $ifNull: ['$jobDescriptionId', false] },
                1,
                0,
              ],
            },
          },
          generationPendingCount: {
            $sum: { $cond: [{ $eq: ['$generationStatus', 'pending'] }, 1, 0] },
          },
          generationQueuedCount: {
            $sum: { $cond: [{ $eq: ['$generationStatus', 'queued'] }, 1, 0] },
          },
          generationRunningCount: {
            $sum: { $cond: [{ $eq: ['$generationStatus', 'running'] }, 1, 0] },
          },
          generationCompletedCount: {
            $sum: { $cond: [{ $eq: ['$generationStatus', 'completed'] }, 1, 0] },
          },
          generationFailedCount: {
            $sum: { $cond: [{ $eq: ['$generationStatus', 'failed'] }, 1, 0] },
          },
        },
      },
    ]),
    ApplicationEventModel.aggregate([
      ...(downloadMatch
        ? [{ $match: { ...downloadMatch, eventType: { $in: ['download_pdf', 'download_docx'] } } }]
        : [{ $match: { eventType: { $in: ['download_pdf', 'download_docx'] } } }]),
      {
        $group: {
          _id: '$userId',
          downloadCount: { $sum: 1 },
          downloadPdfCount: {
            $sum: { $cond: [{ $eq: ['$eventType', 'download_pdf'] }, 1, 0] },
          },
          downloadDocxCount: {
            $sum: { $cond: [{ $eq: ['$eventType', 'download_docx'] }, 1, 0] },
          },
        },
      },
    ]),
  ])

  for (const row of profileRows) {
    const entry = ensureMetrics(metricsByUserId, row._id)
    if (!entry) continue
    entry.profileCount = Number(row.profileCount || 0)
  }

  for (const row of resumeRows) {
    const entry = ensureMetrics(metricsByUserId, row._id)
    if (!entry) continue
    entry.resume.count = Number(row.resumeCount || 0)
  }

  for (const row of jobDescriptionRows) {
    const entry = ensureMetrics(metricsByUserId, row._id)
    if (!entry) continue
    entry.llmUsage.jdParseCount = Number(row.jdParseCount || 0)
  }

  for (const row of chatSessionRows) {
    const entry = ensureMetrics(metricsByUserId, row._id)
    if (!entry) continue
    entry.chat.sessionCount = Number(row.sessionCount || 0)
  }

  for (const row of chatMessageRows) {
    const entry = ensureMetrics(metricsByUserId, row._id)
    if (!entry) continue
    entry.chat.totalMessages = Number(row.totalMessages || 0)
    entry.chat.userMessages = Number(row.userMessages || 0)
    entry.chat.assistantMessages = Number(row.assistantMessages || 0)
  }

  for (const row of applicationRows) {
    const entry = ensureMetrics(metricsByUserId, row._id)
    if (!entry) continue
    entry.resume.jdAppliedCount = Number(row.jdAppliedCount || 0)
    entry.applications.total = Number(row.totalApplications || 0)
    entry.applications.status.inProgress = Number(row.inProgressCount || 0)
    entry.applications.status.applied = Number(row.appliedCount || 0)
    entry.applications.status.declined = Number(row.declinedCount || 0)
    entry.applications.status.cancelled = Number(row.cancelledCount || 0)
    entry.applications.generation.pending = Number(row.generationPendingCount || 0)
    entry.applications.generation.queued = Number(row.generationQueuedCount || 0)
    entry.applications.generation.running = Number(row.generationRunningCount || 0)
    entry.applications.generation.completed = Number(row.generationCompletedCount || 0)
    entry.applications.generation.failed = Number(row.generationFailedCount || 0)
    entry.applications.generation.active =
      entry.applications.generation.queued + entry.applications.generation.running
  }

  for (const row of downloadRows) {
    const entry = ensureMetrics(metricsByUserId, row._id)
    if (!entry) continue
    entry.resume.downloadCount = Number(row.downloadCount || 0)
    entry.resume.downloadPdfCount = Number(row.downloadPdfCount || 0)
    entry.resume.downloadDocxCount = Number(row.downloadDocxCount || 0)
  }

  finalizeLlmMetrics(metricsByUserId)
  return metricsByUserId
}

module.exports = {
  buildUsageMetricsMap,
  createEmptyUsageMetrics,
}
