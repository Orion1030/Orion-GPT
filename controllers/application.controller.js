const crypto = require('crypto')
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const {
  ApplicationModel,
  ApplicationEventModel,
  ChatSessionModel,
  JobModel,
  ProfileModel,
  ResumeModel,
} = require('../dbModels')
const { sendJsonResult } = require('../utils')
const {
  appendApplicationHistory,
  listApplicationHistory,
} = require('../services/applicationHistory.service')
const {
  buildApplicationEventEnvelope,
  subscribeApplicationEvents,
} = require('../services/applicationRealtime.service')
const {
  APPLICATION_STATUS,
  toCanonicalApplicationStatus,
  toLegacyStatus,
  normalizeApplyConfig,
  sanitizeString,
} = require('../services/applicationContract')

function toIdString(value) {
  if (!value) return null
  return String(value)
}

function toSafePage(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return parsed
}

function toSafePageSize(value, fallback = 20, max = 200) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(max, parsed)
}

function getRequestId(req, fallbackPrefix = 'req') {
  const fromHeader = req.headers['x-request-id']
  if (typeof fromHeader === 'string' && fromHeader.trim()) return fromHeader.trim()
  return `${fallbackPrefix}-${crypto.randomUUID()}`
}

function mapApplicationListItem(app) {
  return {
    _id: toIdString(app._id),
    userId: toIdString(app.userId),
    profileId: toIdString(app.profileId),
    profileNameSnapshot: app.profileNameSnapshot || '',
    resumeId: toIdString(app.resumeId),
    resumeName: app.resumeName || '',
    baseResumeId: toIdString(app.baseResumeId),
    jobDescriptionId: toIdString(app.jobDescriptionId),
    companyName: app.companyName || '',
    jobTitle: app.jobTitle || '',
    applicationStatus: app.applicationStatus,
    generationStatus: app.generationStatus,
    status: app.status || toLegacyStatus(app.applicationStatus),
    pipeline: app.pipeline || {},
    version: Number(app.version || 1),
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    lastActivityAt: app.lastActivityAt || app.updatedAt || app.createdAt,
  }
}

function buildSsePayload(appDoc) {
  const generationStatus = appDoc.generationStatus
  const applicationStatus = appDoc.applicationStatus
  const pipeline = appDoc.pipeline || {}
  const resumeId = toIdString(appDoc.resumeId)
  const resumeName = appDoc.resumeName || ''
  const companyName = appDoc.companyName || ''
  const jobTitle = appDoc.jobTitle || ''
  const profileId = toIdString(appDoc.profileId)
  const profileNameSnapshot = appDoc.profileNameSnapshot || ''
  const baseResumeId = toIdString(appDoc.baseResumeId)

  const outcomeCode =
    generationStatus === 'completed'
      ? 'success'
      : generationStatus === 'failed'
      ? 'error'
      : 'running'

  return {
    schemaVersion: 1,
    channel: 'application_pipeline',
    eventType: 'application.updated',
    state: {
      generationStatus,
      applicationStatus,
    },
    pipeline,
    entities: {
      applicationId: toIdString(appDoc._id),
      profileId,
      resumeId,
      generatedResumeId: null,
      baseResumeId,
    },
    snapshot: {
      companyName,
      jobTitle,
      resumeName,
      profileNameSnapshot,
    },
    outcome: {
      code: outcomeCode,
      message: null,
      error: pipeline?.lastError ? String(pipeline.lastError) : null,
    },
    // Legacy compatibility fields kept for current frontend consumers.
    applicationId: toIdString(appDoc._id),
    generationStatus,
    applicationStatus,
    pipeline,
    resumeId,
    resumeName,
    companyName,
    jobTitle,
    profileId,
    profileNameSnapshot,
    baseResumeId,
    data: {
      generatedResumeId: null,
      profileId,
      baseResumeId,
    },
  }
}

exports.applyForApplication = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const jdContext = sanitizeString(req.body?.jdContext)
  if (!jdContext) {
    return sendJsonResult(res, false, null, 'jdContext is required', 400)
  }
  if (jdContext.length > 100 * 1024) {
    return sendJsonResult(res, false, null, 'jdContext exceeds 100KB limit', 413)
  }

  const applyConfig = normalizeApplyConfig({
    resumeReferenceMode: req.body?.resumeReferenceMode,
    profileSelectionMode: req.body?.profileSelectionMode,
    manualProfileId: req.body?.manualProfileId,
    manualResumeId: req.body?.manualResumeId,
  })

  if (applyConfig.profileSelectionMode === 'manual' && !applyConfig.manualProfileId) {
    return sendJsonResult(res, false, null, 'manualProfileId is required when profileSelectionMode=manual', 400)
  }

  if (applyConfig.resumeReferenceMode === 'use_specific_resume' && !applyConfig.manualResumeId) {
    return sendJsonResult(res, false, null, 'manualResumeId is required when resumeReferenceMode=use_specific_resume', 400)
  }

  let profileSnapshot = ''
  let profileId = null
  if (applyConfig.profileSelectionMode === 'manual' && applyConfig.manualProfileId) {
    const profile = await ProfileModel.findOne({
      _id: applyConfig.manualProfileId,
      userId,
    })
      .select('_id fullName title')
      .lean()
    if (!profile) {
      return sendJsonResult(res, false, null, 'manualProfileId is invalid', 404)
    }
    profileId = profile._id
    profileSnapshot = profile.fullName || profile.title || ''
  }

  if (applyConfig.resumeReferenceMode === 'use_specific_resume' && applyConfig.manualResumeId) {
    const resume = await ResumeModel.findOne({
      _id: applyConfig.manualResumeId,
      userId,
      isDeleted: { $ne: true },
    })
      .select('_id')
      .lean()
    if (!resume) {
      return sendJsonResult(res, false, null, 'manualResumeId is invalid', 404)
    }
  }

  const application = new ApplicationModel({
    userId,
    jdContext,
    profileId: profileId || null,
    profileNameSnapshot: profileSnapshot,
    resumeName: '',
    companyName: sanitizeString(req.body?.companyName),
    jobTitle: sanitizeString(req.body?.jobTitle),
    applicationStatus: 'in_progress',
    generationStatus: 'queued',
    applyConfig,
    pipeline: {
      jobId: null,
      currentStep: 'created',
      progress: 0,
      lastError: '',
      startedAt: null,
      completedAt: null,
    },
    status: toLegacyStatus('in_progress'),
    lastActivityAt: new Date(),
  })
  await application.save()

  const job = new JobModel({
    userId,
    type: 'generate_application_resume',
    payload: { applicationId: application._id.toString() },
    status: 'pending',
    progress: 0,
  })
  await job.save()

  const updated = await ApplicationModel.findOneAndUpdate(
    { _id: application._id, userId },
    {
      $set: {
        'pipeline.jobId': job._id,
        lastActivityAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' }
  ).lean()

  const requestId = getRequestId(req, 'apply-created')
  await appendApplicationHistory({
    applicationId: application._id,
    userId,
    eventType: 'created',
    actorType: 'user',
    actorId: userId,
    payload: {
      applicationStatus: 'in_progress',
      generationStatus: 'queued',
      applyConfig: {
        resumeReferenceMode: applyConfig.resumeReferenceMode,
        profileSelectionMode: applyConfig.profileSelectionMode,
        manualProfileId: applyConfig.manualProfileId || null,
        manualResumeId: applyConfig.manualResumeId || null,
      },
      snapshot: {
        companyName: updated?.companyName || '',
        jobTitle: updated?.jobTitle || '',
      },
    },
    requestId,
    source: 'api',
  })

  return sendJsonResult(
    res,
    true,
    {
      applicationId: application._id.toString(),
      jobId: job._id.toString(),
      application: {
        _id: application._id.toString(),
        applicationStatus: 'in_progress',
        generationStatus: 'queued',
      },
    },
    null,
    201
  )
})

exports.listApplications = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const page = toSafePage(req.query.page, 1)
  const pageSize = toSafePageSize(req.query.pageSize, 20, 200)
  const sort = String(req.query.sort || '-createdAt')
  const q = sanitizeString(req.query.q)
  const statusFilter = sanitizeString(req.query.status)
  const generationStatusFilter = sanitizeString(req.query.generationStatus)

  const filter = { userId }
  if (statusFilter) {
    const mappedStatus = toCanonicalApplicationStatus(statusFilter)
    filter.applicationStatus = mappedStatus
  }
  if (generationStatusFilter) {
    filter.generationStatus = generationStatusFilter
  }
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [
      { companyName: regex },
      { jobTitle: regex },
      { resumeName: regex },
      { profileNameSnapshot: regex },
    ]
  }

  const sortDoc = {}
  if (sort === 'createdAt') sortDoc.createdAt = 1
  else if (sort === '-updatedAt') sortDoc.updatedAt = -1
  else if (sort === 'updatedAt') sortDoc.updatedAt = 1
  else sortDoc.createdAt = -1

  const skip = (page - 1) * pageSize
  const [items, total] = await Promise.all([
    ApplicationModel.find(filter)
      .sort(sortDoc)
      .skip(skip)
      .limit(pageSize)
      .lean(),
    ApplicationModel.countDocuments(filter),
  ])

  return sendJsonResult(res, true, {
    items: (items || []).map(mapApplicationListItem),
    total: Number(total || 0),
    page,
    pageSize,
  })
})

exports.getApplicationDetail = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { applicationId } = req.params

  const application = await ApplicationModel.findOne({ _id: applicationId, userId })
    .populate('profileId', '_id fullName title')
    .populate('resumeId', '_id name profileId')
    .populate('baseResumeId', '_id name profileId')
    .populate('jobDescriptionId', '_id title company skills requirements responsibilities niceToHave')
    .populate('chatSessionId', '_id title')
    .populate('pipeline.jobId', '_id type status progress createdAt updatedAt')
    .lean()

  if (!application) {
    return sendJsonResult(res, false, null, 'Application not found', 404)
  }

  return sendJsonResult(res, true, application)
})

function parsePatchBody(body) {
  const updates = {}
  const changedFields = []

  const resumeName = body?.resumeName
  if (resumeName !== undefined) {
    updates.resumeName = sanitizeString(resumeName)
    changedFields.push('resumeName')
  }

  const companyName = body?.companyName
  if (companyName !== undefined) {
    updates.companyName = sanitizeString(companyName)
    changedFields.push('companyName')
  }

  const jobTitle = body?.jobTitle
  if (jobTitle !== undefined) {
    updates.jobTitle = sanitizeString(jobTitle)
    changedFields.push('jobTitle')
  }

  const incomingStatus = body?.applicationStatus ?? body?.status
  if (incomingStatus !== undefined) {
    const canonical = toCanonicalApplicationStatus(incomingStatus)
    if (APPLICATION_STATUS.includes(canonical)) {
      updates.applicationStatus = canonical
      updates.status = toLegacyStatus(canonical)
      changedFields.push('applicationStatus')
    }
  }

  if (body?.jdMeta && typeof body.jdMeta === 'object') {
    const jdMeta = {}
    if (body.jdMeta.jobType !== undefined) {
      jdMeta.jobType = body.jdMeta.jobType
      changedFields.push('jdMeta.jobType')
    }
    if (body.jdMeta.workType !== undefined) {
      jdMeta.workType = body.jdMeta.workType
      changedFields.push('jdMeta.workType')
    }
    if (body.jdMeta.salary !== undefined && body.jdMeta.salary && typeof body.jdMeta.salary === 'object') {
      const salary = {}
      if (body.jdMeta.salary.salaryType !== undefined) {
        salary.salaryType = body.jdMeta.salary.salaryType
        changedFields.push('jdMeta.salary.salaryType')
      }
      if (body.jdMeta.salary.min !== undefined) {
        salary.min = body.jdMeta.salary.min
        changedFields.push('jdMeta.salary.min')
      }
      if (body.jdMeta.salary.max !== undefined) {
        salary.max = body.jdMeta.salary.max
        changedFields.push('jdMeta.salary.max')
      }
      if (body.jdMeta.salary.currency !== undefined) {
        salary.currency = body.jdMeta.salary.currency
        changedFields.push('jdMeta.salary.currency')
      }
      if (Object.keys(salary).length > 0) {
        jdMeta.salary = salary
      }
    }
    if (Object.keys(jdMeta).length > 0) {
      updates.jdMeta = jdMeta
    }
  }

  return { updates, changedFields }
}

function pickValueByPath(obj, fieldPath) {
  return fieldPath.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

exports.patchApplication = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { applicationId } = req.params
  const { updates, changedFields } = parsePatchBody(req.body || {})
  if (!changedFields.length) {
    return sendJsonResult(res, false, null, 'No updatable fields provided', 400)
  }

  const existing = await ApplicationModel.findOne({ _id: applicationId, userId }).lean()
  if (!existing) {
    return sendJsonResult(res, false, null, 'Application not found', 404)
  }

  const mergedJdMeta = {
    ...(existing.jdMeta || {}),
    ...(updates.jdMeta || {}),
    salary: {
      ...((existing.jdMeta && existing.jdMeta.salary) || {}),
      ...((updates.jdMeta && updates.jdMeta.salary) || {}),
    },
  }
  if (updates.jdMeta) {
    updates.jdMeta = mergedJdMeta
  }

  const updated = await ApplicationModel.findOneAndUpdate(
    { _id: applicationId, userId },
    {
      $set: {
        ...updates,
        lastActivityAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' }
  ).lean()

  if (!updated) {
    return sendJsonResult(res, false, null, 'Application not found', 404)
  }

  const baseRequestId = getRequestId(req, 'application-patch')
  let index = 0
  for (const field of changedFields) {
    const oldValue = pickValueByPath(existing, field)
    const newValue = pickValueByPath(updated, field)
    if (String(oldValue ?? '') === String(newValue ?? '')) continue

    const isStatusUpdate = field === 'applicationStatus'
    await appendApplicationHistory({
      applicationId: updated._id,
      userId,
      eventType: isStatusUpdate ? 'status_updated' : 'field_updated',
      actorType: 'user',
      actorId: userId,
      payload: {
        field,
        oldValue: oldValue === undefined ? null : oldValue,
        newValue: newValue === undefined ? null : newValue,
      },
      requestId: `${baseRequestId}-${index}`,
      source: 'api',
    })
    index += 1
  }

  return sendJsonResult(res, true, updated, 'Application updated successfully')
})

exports.resolveApplicationChat = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { applicationId } = req.params
  const app = await ApplicationModel.findOne({ _id: applicationId, userId }).lean()
  if (!app) {
    return sendJsonResult(res, false, null, 'Application not found', 404)
  }

  let chatSessionId = app.chatSessionId ? String(app.chatSessionId) : null
  let isNew = false

  if (chatSessionId) {
    const existingSession = await ChatSessionModel.findOne({
      _id: chatSessionId,
      userId,
    })
      .select('_id')
      .lean()
    if (!existingSession) {
      chatSessionId = null
    }
  }

  if (!chatSessionId) {
    const created = new ChatSessionModel({
      userId,
      profileId: app.profileId || null,
      jobDescriptionId: app.jobDescriptionId || null,
      chatType: 'jd',
      title: 'New Chat',
    })
    await created.save()
    chatSessionId = created._id.toString()
    isNew = true

    await ApplicationModel.findOneAndUpdate(
      { _id: applicationId, userId },
      {
        $set: {
          chatSessionId: created._id,
          lastActivityAt: new Date(),
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' }
    ).lean()

    await appendApplicationHistory({
      applicationId,
      userId,
      eventType: 'chat_linked',
      actorType: 'user',
      actorId: userId,
      payload: {
        chatSessionId,
        isNew: true,
      },
      requestId: getRequestId(req, 'chat-linked'),
      source: 'api',
    })
  }

  await appendApplicationHistory({
    applicationId,
    userId,
    eventType: 'chat_opened',
    actorType: 'user',
    actorId: userId,
    payload: {
      chatSessionId,
      isNew,
    },
    requestId: getRequestId(req, 'chat-opened'),
    source: 'api',
  })

  return sendJsonResult(res, true, { chatSessionId, isNew })
})

exports.getApplicationHistory = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { applicationId } = req.params
  const page = toSafePage(req.query.page, 1)
  const pageSize = toSafePageSize(req.query.pageSize, 50, 200)

  const result = await listApplicationHistory({
    applicationId,
    userId,
    page,
    pageSize,
  })

  if (!result) {
    return sendJsonResult(res, false, null, 'Application not found', 404)
  }

  return sendJsonResult(res, true, result)
})

exports.streamApplicationEvents = async (req, res) => {
  const userId = req.user._id
  const { applicationId } = req.params

  const app = await ApplicationModel.findOne({ _id: applicationId, userId }).lean()
  if (!app) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Application not found',
      showNotification: false,
    })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEnvelope = (envelope) => {
    res.write(`data: ${JSON.stringify(envelope)}\n\n`)
  }

  sendEnvelope(
    buildApplicationEventEnvelope({
      type: 'application.updated',
      applicationId: app._id,
      version: app.version || 1,
      data: buildSsePayload(app),
    })
  )

  const unsubscribe = subscribeApplicationEvents(app._id, res)
  const keepAliveTimer = setInterval(() => {
    res.write(': keep-alive\n\n')
  }, 15000)

  req.on('close', () => {
    clearInterval(keepAliveTimer)
    unsubscribe()
  })
}

exports.deleteApplication = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const applicationId = req.params.applicationId || req.params.id

  const deleted = await ApplicationModel.findOneAndDelete({
    _id: applicationId,
    userId,
  }).lean()

  if (!deleted) {
    return sendJsonResult(res, false, null, 'Application not found', 404)
  }

  await ApplicationEventModel.deleteMany({ applicationId: deleted._id })
  return sendJsonResult(res, true, null, 'Application deleted successfully')
})

exports.getApplicationsByProfileId = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { profileId } = req.params
  const applications = await ApplicationModel.find({ userId, profileId })
    .sort({ createdAt: -1 })
    .lean()
  return sendJsonResult(res, true, (applications || []).map(mapApplicationListItem))
})
