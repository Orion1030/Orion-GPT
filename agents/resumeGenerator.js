const { JobDescriptionModel, ProfileModel, ResumeModel, ChatMessageModel } = require('../dbModels')
const { refreshResumeEmbedding } = require('../services/resumeEmbedding.service')
const { generateResumeJsonFromJD } = require('../utils/resumeGeneration')

module.exports = async function resumeGenerator(job, updateProgress) {
  const { jdId, profileId, baseResumeId } = job.payload || {}
  if (!jdId || !profileId) throw new Error('jdId and profileId are required')
  const jd = await JobDescriptionModel.findById(jdId).lean()
  const profile = await ProfileModel.findById(profileId).lean()
  if (!jd || !profile) throw new Error('JD or profile not found')
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) throw new Error('LLM not configured')

  let baseResume = null
  if (baseResumeId) {
    baseResume = await ResumeModel.findOne({ _id: baseResumeId, userId: job.userId }).lean()
  }

  updateProgress(10)
  const resume = await generateResumeJsonFromJD({ jd, profile, baseResume, openaiKey })
  updateProgress(90, { resume })

  // Create assistant message + Resume doc if sessionId provided.
  if (job.payload && job.payload.sessionId) {
    try {
      const created = new ResumeModel({
        userId: job.userId,
        name: resume.name,
        profileId: profileId,
        summary: resume.summary || '',
        experiences: Array.isArray(resume.experiences) ? resume.experiences : [],
        skills: Array.isArray(resume.skills) ? resume.skills : [],
        pageFrameConfig: resume.pageFrameConfig || null,
      })

      await created.save()
      await refreshResumeEmbedding(created._id).catch(() => {})

      await ChatMessageModel.create({
        sessionId: job.payload.sessionId,
        role: 'assistant',
        content: resume.summary || created.name,
        structuredAssistantPayload: {
          type: 'generated_resume',
          resumeId: created._id.toString(),
          resumeName: created.name,
          profileName: profile.fullName || null,
        },
      })
    } catch (e) {
      // ignore write errors
    }
  }

  return { resume }
}

