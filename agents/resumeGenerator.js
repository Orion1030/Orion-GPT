const { JobDescriptionModel, ProfileModel, ResumeModel } = require('../dbModels')
const { generateResumeJsonFromJD } = require('../utils/resumeGeneration')
const { persistGeneratedResume } = require('../services/agentPersistence.service')

module.exports = async function resumeGenerator(job, updateProgress) {
  const { jdId, profileId, baseResumeId, sessionId } = job.payload || {}
  if (!jdId || !profileId) throw new Error('jdId and profileId are required')

  const jd = await JobDescriptionModel.findById(jdId).lean()
  const profile = await ProfileModel.findById(profileId).lean()
  if (!jd || !profile) throw new Error('JD or profile not found')

  let baseResume = null
  if (baseResumeId) {
    baseResume = await ResumeModel.findOne({ _id: baseResumeId, userId: job.userId, isDeleted: { $ne: true } }).lean()
  }

  updateProgress(10)
  const resume = await generateResumeJsonFromJD({ jd, profile, baseResume })
  updateProgress(80, { resume })

  await persistGeneratedResume({
    userId: job.userId,
    profileId,
    resume,
    sessionId,
    profileFullName: profile.fullName || null,
  }).catch(() => {})

  updateProgress(100, { resume })
  return { resume }
}
