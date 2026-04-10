const {
  ApplicationModel,
  JobDescriptionModel,
  ProfileModel,
  ResumeModel,
} = require('../dbModels')
const {
  tryParseAndPersistJobDescription,
  tryFindTopProfilesForJobDescription,
  tryFindTopResumesForJobDescription,
} = require('./jdImport.service')
const { tryGenerateResumeJsonFromJD } = require('../utils/resumeGeneration')
const { appendApplicationHistory } = require('./applicationHistory.service')
const {
  buildApplicationEventEnvelope,
  publishApplicationEvent,
} = require('./applicationRealtime.service')
const { queueResumeEmbeddingRefresh } = require('./resumeEmbedding.service')

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
  }
}

function sanitizeError(error) {
  const message = error?.message || String(error || 'Unknown pipeline error')
  return String(message).slice(0, 1000)
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

  if (history?.eventType) {
    await appendApplicationHistory({
      applicationId: app._id,
      userId: app.userId,
      eventType: history.eventType,
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
      data: eventData || buildPipelineData(app),
    })
  )

  return app
}

async function resolveProfile({ application, jdId, userId }) {
  const mode = application.applyConfig?.profileSelectionMode
  if (mode === 'manual' && application.applyConfig?.manualProfileId) {
    const profile = await ProfileModel.findOne({
      _id: application.applyConfig.manualProfileId,
      userId,
    }).lean()
    if (!profile) throw new Error('Manual profile not found')
    return profile
  }

  const { result, error } = await tryFindTopProfilesForJobDescription({ userId, jdId })
  if (error) throw new Error(error.message || 'Could not match profile')

  const topProfile = Array.isArray(result?.topProfiles) ? result.topProfiles[0] : null
  if (!topProfile?.profileId) throw new Error('No matching profile found for this JD')

  const profile = await ProfileModel.findOne({
    _id: topProfile.profileId,
    userId,
  }).lean()
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

async function persistGeneratedResume({ userId, profileId, generatedResume }) {
  const resumeDoc = new ResumeModel({
    userId,
    profileId,
    name: generatedResume?.name || 'Generated Resume',
    summary: generatedResume?.summary || '',
    experiences: Array.isArray(generatedResume?.experiences) ? generatedResume.experiences : [],
    skills: Array.isArray(generatedResume?.skills) ? generatedResume.skills : [],
    education: Array.isArray(generatedResume?.education) ? generatedResume.education : [],
    pageFrameConfig: generatedResume?.pageFrameConfig || null,
  })
  await resumeDoc.save()
  queueResumeEmbeddingRefresh(resumeDoc._id, { maxAttempts: 3 })
  return resumeDoc
}

async function runApplicationPipeline({ applicationId, userId, jobId, updateProgress }) {
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
          progress: 5,
          lastError: '',
          startedAt: new Date(),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'created', progress: 5 },
      },
      history: {
        eventType: 'pipeline_step',
        payload: {
          step: 'created',
          progress: 5,
          details: { jobId: String(jobId) },
        },
        requestId: `pipeline-${applicationId}-created`,
      },
    })
    if (typeof updateProgress === 'function') {
      await updateProgress(5)
    }

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
          progress: 20,
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'jd_parsed', progress: 20 },
      },
      history: {
        eventType: 'pipeline_step',
        payload: {
          step: 'jd_parsed',
          progress: 20,
          details: { jobDescriptionId: String(jdId) },
        },
        requestId: `pipeline-${applicationId}-jd_parsed`,
      },
    })
    if (typeof updateProgress === 'function') {
      await updateProgress(20)
    }

    currentStep = 'profile_selected'
    const profile = await resolveProfile({ application: app, jdId, userId })
    await updateAndPublish({
      applicationId,
      userId,
      set: {
        profileId: profile._id,
        profileNameSnapshot: profile.fullName || profile.title || '',
        pipeline: {
          ...(app.pipeline || {}),
          jobId,
          currentStep: 'profile_selected',
          progress: 40,
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'profile_selected', progress: 40 },
      },
      history: {
        eventType: 'pipeline_step',
        payload: {
          step: 'profile_selected',
          progress: 40,
          details: { profileId: String(profile._id) },
        },
        requestId: `pipeline-${applicationId}-profile_selected`,
      },
    })
    if (typeof updateProgress === 'function') {
      await updateProgress(40)
    }

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
          progress: 55,
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'base_resume_selected', progress: 55 },
      },
      history: {
        eventType: 'pipeline_step',
        payload: {
          step: 'base_resume_selected',
          progress: 55,
          details: { baseResumeId: baseResume?._id ? String(baseResume._id) : null },
        },
        requestId: `pipeline-${applicationId}-base_resume_selected`,
      },
    })
    if (typeof updateProgress === 'function') {
      await updateProgress(55)
    }

    currentStep = 'resume_generated'
    const jd = await JobDescriptionModel.findOne({ _id: jdId, userId }).lean()
    if (!jd) throw new Error('Parsed JD not found')

    const { result: generateResult, error: generateError } = await tryGenerateResumeJsonFromJD({
      jd,
      profile,
      baseResume,
    })
    if (generateError) {
      throw new Error(generateError.message || 'Resume generation failed')
    }
    const generatedResume = generateResult.resume
    await updateAndPublish({
      applicationId,
      userId,
      set: {
        pipeline: {
          ...(app.pipeline || {}),
          jobId,
          currentStep: 'resume_generated',
          progress: 75,
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'resume_generated', progress: 75 },
      },
      history: {
        eventType: 'pipeline_step',
        payload: {
          step: 'resume_generated',
          progress: 75,
          details: {},
        },
        requestId: `pipeline-${applicationId}-resume_generated`,
      },
    })
    if (typeof updateProgress === 'function') {
      await updateProgress(75)
    }

    currentStep = 'resume_saved'
    const resumeDoc = await persistGeneratedResume({
      userId,
      profileId: profile._id,
      generatedResume,
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
          progress: 90,
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: null,
        },
      },
      eventType: 'application.pipeline_step',
      eventData: {
        generationStatus: 'running',
        pipeline: { currentStep: 'resume_saved', progress: 90 },
      },
      history: {
        eventType: 'pipeline_step',
        payload: {
          step: 'resume_saved',
          progress: 90,
          details: { resumeId: String(resumeDoc._id) },
        },
        requestId: `pipeline-${applicationId}-resume_saved`,
      },
    })
    if (typeof updateProgress === 'function') {
      await updateProgress(90)
    }

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
          progress: 100,
          lastError: '',
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: new Date(),
        },
      },
      eventType: 'application.completed',
      eventData: {
        generationStatus: 'completed',
        pipeline: { currentStep: 'completed', progress: 100 },
        resumeId: String(resumeDoc._id),
      },
      history: {
        eventType: 'pipeline_completed',
        payload: {
          resumeId: String(resumeDoc._id),
          durationMs,
        },
        requestId: `pipeline-${applicationId}-completed`,
      },
    })
    if (typeof updateProgress === 'function') {
      await updateProgress(100, { resumeId: String(resumeDoc._id) })
    }

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
          progress: Number(app.pipeline?.progress || 0),
          lastError: safeError,
          startedAt: new Date(app.pipeline?.startedAt || Date.now()),
          completedAt: new Date(),
        },
      },
      eventType: 'application.failed',
      eventData: {
        generationStatus: 'failed',
        pipeline: { currentStep: 'failed', progress: Number(app.pipeline?.progress || 0) },
        error: safeError,
      },
      history: {
        eventType: 'pipeline_failed',
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

