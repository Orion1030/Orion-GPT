const {
  ApplicationModel,
  JobDescriptionModel,
  ProfileModel,
  ResumeModel,
  TemplateModel,
} = require('../dbModels')
const {
  tryParseAndPersistJobDescription,
  tryFindTopProfilesForJobDescription,
  tryFindTopResumesForJobDescription,
} = require('./jdImport.service')
const { tryGenerateApplicationMaterialsJsonFromJD } = require('../utils/resumeGeneration')
const { appendApplicationHistory } = require('./applicationHistory.service')
const { buildReadableProfileFilterForUser } = require('./profileAccess.service')
const {
  buildApplicationEventEnvelope,
  publishApplicationEvent,
} = require('./applicationRealtime.service')
const { queueResumeEmbeddingRefresh } = require('./resumeEmbedding.service')
const { formatProfileDisplayName } = require('../utils/profileDisplay')

function buildPipelineData(app) {
  return {
    generationStatus: app.generationStatus,
    applicationStatus: app.applicationStatus,
    pipeline: app.pipeline || {},
    resumeId: app.resumeId || null,
    resumeName: app.resumeName || '',
    companyName: app.companyName || '',
    jobTitle: app.jobTitle || '',
    profileId: app.profileId || null,
    profileNameSnapshot: app.profileNameSnapshot || '',
    baseResumeId: app.baseResumeId || null,
  }
}

function sanitizeError(error) {
  const message = error?.message || String(error || 'Unknown pipeline error')
  return String(message).slice(0, 1000)
}

function toIdString(value) {
  if (value == null || value === '') return null
  return String(value)
}

// Canonical realtime payload contract for application pipeline events.
// Keep legacy compatibility fields at the root while standard fields live under:
// { schemaVersion, channel, eventType, state, pipeline, entities, snapshot, outcome }.
function buildStandardizedRealtimeData({ app, eventType, eventData = null }) {
  const legacyData = eventData && typeof eventData === 'object' ? eventData : {}
  const legacyNestedData =
    legacyData.data && typeof legacyData.data === 'object' ? legacyData.data : {}

  const generationStatus =
    typeof legacyData.generationStatus === 'string'
      ? legacyData.generationStatus
      : app.generationStatus
  const applicationStatus =
    typeof legacyData.applicationStatus === 'string'
      ? legacyData.applicationStatus
      : app.applicationStatus
  const rawPipeline =
    legacyData.pipeline && typeof legacyData.pipeline === 'object'
      ? legacyData.pipeline
      : app.pipeline || {}
  const pipeline = { ...(rawPipeline || {}) }
  // Progress percentages are intentionally omitted from realtime payloads.
  if (Object.prototype.hasOwnProperty.call(pipeline, 'progress')) {
    delete pipeline.progress
  }

  const generatedResumeId = toIdString(
    legacyNestedData.generatedResumeId || legacyData.generatedResumeId || null
  )
  const profileId = toIdString(
    legacyNestedData.profileId || legacyData.profileId || app.profileId || null
  )
  const baseResumeId = toIdString(
    legacyNestedData.baseResumeId !== undefined
      ? legacyNestedData.baseResumeId
      : legacyData.baseResumeId !== undefined
      ? legacyData.baseResumeId
      : app.baseResumeId || null
  )
  const resumeId = toIdString(legacyData.resumeId || generatedResumeId || app.resumeId || null)

  const resumeName =
    typeof legacyData.resumeName === 'string' ? legacyData.resumeName : app.resumeName || ''
  const companyName =
    typeof legacyData.companyName === 'string' ? legacyData.companyName : app.companyName || ''
  const jobTitle =
    typeof legacyData.jobTitle === 'string' ? legacyData.jobTitle : app.jobTitle || ''
  const profileNameSnapshot =
    typeof legacyData.profileNameSnapshot === 'string'
      ? legacyData.profileNameSnapshot
      : app.profileNameSnapshot || ''

  let outcomeCode = 'running'
  if (legacyData.status === 'success' || generationStatus === 'completed') {
    outcomeCode = 'success'
  } else if (legacyData.status === 'error' || generationStatus === 'failed') {
    outcomeCode = 'error'
  }

  const message = typeof legacyData.msg === 'string' ? legacyData.msg : ''
  const errorText =
    typeof legacyData.error === 'string'
      ? legacyData.error
      : outcomeCode === 'error'
      ? String(pipeline?.lastError || '')
      : ''

  const standardData = {
    schemaVersion: 1,
    channel: 'application_pipeline',
    eventType,
    state: {
      generationStatus,
      applicationStatus,
    },
    pipeline,
    entities: {
      applicationId: String(app._id),
      profileId,
      resumeId,
      generatedResumeId,
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
      message: message || null,
      error: errorText || null,
    },
  }

  // Legacy compatibility fields kept for current frontend consumers.
  return {
    ...standardData,
    status:
      outcomeCode === 'success'
        ? 'success'
        : outcomeCode === 'error'
        ? 'error'
        : undefined,
    data: {
      generatedResumeId,
      profileId,
      baseResumeId,
    },
    msg: message || undefined,
    error: errorText || undefined,
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
  }
}

async function updateAndPublish({
  applicationId,
  userId,
  set = {},
  eventType = 'application.updated',
  eventData = null,
  history = null,
}) {
  const now = new Date()
  const app = await ApplicationModel.findOneAndUpdate(
    { _id: applicationId, userId },
    {
      $set: {
        ...set,
        lastActivityAt: now,
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' }
  ).lean()

  if (!app) {
    throw new Error('Application not found')
  }

  if (history) {
    const historyEventType =
      typeof history.eventType === 'string' && history.eventType.trim()
        ? history.eventType.trim()
        : eventType

    await appendApplicationHistory({
      applicationId: app._id,
      userId: app.userId,
      eventType: historyEventType,
      actorType: history.actorType || 'system',
      actorId: history.actorId || null,
      payload: history.payload || {},
      requestId: history.requestId || null,
      source: history.source || 'worker',
    })
  }

  publishApplicationEvent(
    app._id,
    buildApplicationEventEnvelope({
      type: eventType,
      applicationId: app._id,
      version: app.version,
      data: buildStandardizedRealtimeData({
        app,
        eventType,
        eventData: eventData || buildPipelineData(app),
      }),
    }),
    { userId: app.userId }
  )

  return app
}

async function resolveProfile({ application, jdId, userId }) {
  const mode = application.applyConfig?.profileSelectionMode
  if (mode === 'manual' && application.applyConfig?.manualProfileId) {
    const profile = await ProfileModel.findOne(
      await buildReadableProfileFilterForUser(userId, {
        _id: application.applyConfig.manualProfileId,
      })
    ).lean()
    if (!profile) throw new Error('Manual profile not found')
    return profile
  }

  const { result, error } = await tryFindTopProfilesForJobDescription({ userId, jdId })
  if (error) throw new Error(error.message || 'Could not match profile')

  const topProfile = Array.isArray(result?.topProfiles) ? result.topProfiles[0] : null
  if (!topProfile?.profileId) throw new Error('No matching profile found for this JD')

  const profile = await ProfileModel.findOne(
    await buildReadableProfileFilterForUser(userId, { _id: topProfile.profileId })
  ).lean()
  if (!profile) throw new Error('Matched profile not found')
  return profile
}

async function resolveBaseResume({ application, jdId, userId, profileId }) {
  const mode = application.applyConfig?.resumeReferenceMode

  if (mode === 'generate_from_scratch') {
    return null
  }

  if (mode === 'use_specific_resume' && application.applyConfig?.manualResumeId) {
    const resume = await ResumeModel.findOne({
      _id: application.applyConfig.manualResumeId,
      userId,
      isDeleted: { $ne: true },
    }).lean()
    if (!resume) throw new Error('Selected base resume not found')
    return resume
  }

  const { result, error } = await tryFindTopResumesForJobDescription({
    userId,
    jdId,
    profileId,
  })
  if (error) return null

  const topResume = Array.isArray(result?.topResumes) ? result.topResumes[0] : null
  if (!topResume?.resumeId) return null

  return ResumeModel.findOne({
    _id: topResume.resumeId,
    userId,
    isDeleted: { $ne: true },
  }).lean()
}

async function persistGeneratedResume({
  userId,
  profileId,
  generatedResume,
  coverLetter = null,
  templateId = null,
  coverLetterTemplateId = null,
}) {
  const resumeDoc = new ResumeModel({
    userId,
    profileId,
    templateId,
    coverLetterTemplateId,
    name: generatedResume?.name || 'Generated Resume',
    summary: generatedResume?.summary || '',
    experiences: Array.isArray(generatedResume?.experiences) ? generatedResume.experiences : [],
    skills: Array.isArray(generatedResume?.skills) ? generatedResume.skills : [],
    education: Array.isArray(generatedResume?.education) ? generatedResume.education : [],
    coverLetter: coverLetter || null,
    pageFrameConfig: generatedResume?.pageFrameConfig || null,
  })
  await resumeDoc.save()
  queueResumeEmbeddingRefresh(resumeDoc._id, { maxAttempts: 3 })
  return resumeDoc
}

async function resolveResumeTemplateId({ application, profile, userId }) {
  const preferredTemplateId =
    application?.applyConfig?.selectedTemplateId || profile?.defaultTemplateId || null
  if (!preferredTemplateId) return null

  const template = await TemplateModel.findOne({
    _id: preferredTemplateId,
    $and: [
      { $or: [{ templateType: 'resume' }, { templateType: { $exists: false } }] },
      { $or: [{ isBuiltIn: true }, { userId }] },
    ],
  })
    .select('_id')
    .lean()

  return template?._id || null
}

async function resolveCoverLetterTemplateId({ application, profile, userId }) {
  const preferredTemplateId =
    application?.applyConfig?.selectedCoverLetterTemplateId ||
    profile?.defaultCoverLetterTemplateId ||
    null
  if (!preferredTemplateId) return null

  const template = await TemplateModel.findOne({
    _id: preferredTemplateId,
    templateType: 'cover_letter',
    $or: [{ isBuiltIn: true }, { userId }],
  })
    .select('_id')
    .lean()

  return template?._id || null
}

async function runApplicationPipeline({ applicationId, userId, jobId }) {
  const start = Date.now()
  const app = await ApplicationModel.findOne({ _id: applicationId, userId }).lean()
  if (!app) throw new Error('Application not found')
  if (!app.jdContext || !String(app.jdContext).trim()) {
    throw new Error('Application jdContext is missing')
  }

  let currentStep = 'created'

  try {
    await updateAndPublish({
      applicationId,
      userId,
      set: {
        generationStatus: 'running',
        pipeline: {
          ...(app.pipeline || {}),
          jobId,
          currentStep: 'created',
          lastError: '',
          startedAt: new Date(),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'created' },
      },
      history: {
        payload: {
          step: 'created',
          details: { jobId: String(jobId) },
        },
        requestId: `pipeline-${applicationId}-created`,
      },
    })

    currentStep = 'jd_parsed'
    const { result: jdResult, error: jdError } = await tryParseAndPersistJobDescription({
      userId,
      jdContext: app.jdContext,
    })
    if (jdError) throw new Error(jdError.message || 'Failed to parse JD')

    const jdId = jdResult.jdId
    const parsed = jdResult.parsed || {}
    await updateAndPublish({
      applicationId,
      userId,
      set: {
        jobDescriptionId: jdId,
        companyName: app.companyName || parsed.company || '',
        jobTitle: app.jobTitle || parsed.title || '',
        pipeline: {
          ...(app.pipeline || {}),
          jobId,
          currentStep: 'jd_parsed',
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'jd_parsed' },
      },
      history: {
        payload: {
          step: 'jd_parsed',
          details: { jobDescriptionId: String(jdId) },
        },
        requestId: `pipeline-${applicationId}-jd_parsed`,
      },
    })

    currentStep = 'profile_selected'
    const profile = await resolveProfile({ application: app, jdId, userId })
    const profileDisplayName = formatProfileDisplayName(profile, profile.fullName || profile.title || '')
    await updateAndPublish({
      applicationId,
      userId,
      set: {
        profileId: profile._id,
        profileNameSnapshot: profileDisplayName,
        pipeline: {
          ...(app.pipeline || {}),
          jobId,
          currentStep: 'profile_selected',
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'profile_selected' },
        profileId: String(profile._id),
        profileNameSnapshot: profileDisplayName,
      },
      history: {
        payload: {
          step: 'profile_selected',
          details: { profileId: String(profile._id) },
        },
        requestId: `pipeline-${applicationId}-profile_selected`,
      },
    })

    currentStep = 'base_resume_selected'
    const baseResume = await resolveBaseResume({
      application: app,
      jdId,
      userId,
      profileId: profile._id,
    })
    await updateAndPublish({
      applicationId,
      userId,
      set: {
        baseResumeId: baseResume?._id || null,
        pipeline: {
          ...(app.pipeline || {}),
          jobId,
          currentStep: 'base_resume_selected',
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'base_resume_selected' },
        baseResumeId: baseResume?._id ? String(baseResume._id) : null,
      },
      history: {
        payload: {
          step: 'base_resume_selected',
          details: { baseResumeId: baseResume?._id ? String(baseResume._id) : null },
        },
        requestId: `pipeline-${applicationId}-base_resume_selected`,
      },
    })

    currentStep = 'resume_generated'
    const jd = await JobDescriptionModel.findOne({ _id: jdId, userId }).lean()
    if (!jd) throw new Error('Parsed JD not found')

    const { result: generateResult, error: generateError } = await tryGenerateApplicationMaterialsJsonFromJD({
      jd,
      profile,
      baseResume,
      auditContext: {
        requestId: `pipeline-${applicationId}-resume_generation_prompt`,
        source: "pipeline.resume_generation",
        actorType: "system",
        actorUserId: null,
        trigger: "application_pipeline",
        applicationId: String(applicationId),
        jobDescriptionId: jdId ? String(jdId) : null,
        profileId: profile?._id ? String(profile._id) : null,
        baseResumeId: baseResume?._id ? String(baseResume._id) : null,
      },
    })
    if (generateError) {
      throw new Error(generateError.message || 'Resume generation failed')
    }
    const generatedResume = generateResult.resume
    const coverLetter = generateResult.coverLetter || null
    await updateAndPublish({
      applicationId,
      userId,
      set: {
        pipeline: {
          ...(app.pipeline || {}),
          jobId,
          currentStep: 'resume_generated',
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'resume_generated' },
      },
      history: {
        payload: {
          step: 'resume_generated',
          details: {},
        },
        requestId: `pipeline-${applicationId}-resume_generated`,
      },
    })

    currentStep = 'resume_saved'
    const selectedTemplateId = await resolveResumeTemplateId({
      application: app,
      profile,
      userId,
    })
    const selectedCoverLetterTemplateId = await resolveCoverLetterTemplateId({
      application: app,
      profile,
      userId,
    })
    const resumeDoc = await persistGeneratedResume({
      userId,
      profileId: profile._id,
      generatedResume,
      coverLetter,
      templateId: selectedTemplateId,
      coverLetterTemplateId: selectedCoverLetterTemplateId,
    })
    await updateAndPublish({
      applicationId,
      userId,
      set: {
        resumeId: resumeDoc._id,
        resumeName: resumeDoc.name || '',
        pipeline: {
          ...(app.pipeline || {}),
          jobId,
          currentStep: 'resume_saved',
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'resume_saved' },
        resumeId: String(resumeDoc._id),
        resumeName: resumeDoc.name || '',
      },
      history: {
        payload: {
          step: 'resume_saved',
          details: { resumeId: String(resumeDoc._id) },
        },
        requestId: `pipeline-${applicationId}-resume_saved`,
      },
    })

    const durationMs = Date.now() - start
    await updateAndPublish({
      applicationId,
      userId,
      set: {
        generationStatus: 'completed',
        pipeline: {
          ...(app.pipeline || {}),
          jobId,
          currentStep: 'completed',
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: new Date(),
        },
      },
      eventType: 'application.completed',
      eventData: {
        applicationId: String(applicationId),
        status: 'success',
        data: {
          generatedResumeId: String(resumeDoc._id),
          profileId: String(profile._id),
          baseResumeId: baseResume?._id ? String(baseResume._id) : null,
        },
        msg: 'Resume generation completed successfully',
        generationStatus: 'completed',
        pipeline: { currentStep: 'completed' },
        resumeId: String(resumeDoc._id),
        profileId: String(profile._id),
        baseResumeId: baseResume?._id ? String(baseResume._id) : null,
        profileNameSnapshot: profileDisplayName,
      },
      history: {
        payload: {
          resumeId: String(resumeDoc._id),
          durationMs,
        },
        requestId: `pipeline-${applicationId}-completed`,
      },
    })
    return {
      resumeId: String(resumeDoc._id),
      applicationId: String(applicationId),
    }
  } catch (error) {
    const safeError = sanitizeError(error)
    await updateAndPublish({
      applicationId,
      userId,
      set: {
        generationStatus: 'failed',
        pipeline: {
          ...(app.pipeline || {}),
          jobId,
          currentStep: 'failed',
          lastError: safeError,
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: new Date(),
        },
      },
      eventType: 'application.failed',
      eventData: {
        applicationId: String(applicationId),
        status: 'error',
        msg: safeError,
        generationStatus: 'failed',
        pipeline: { currentStep: 'failed' },
        error: safeError,
      },
      history: {
        payload: {
          step: currentStep,
          error: safeError,
        },
        requestId: `pipeline-${applicationId}-failed`,
      },
    })
    throw new Error(safeError)
  }
}

module.exports = {
  runApplicationPipeline,
}
