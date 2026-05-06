const { JobDescriptionModel, ProfileModel, ResumeModel } = require('../dbModels')
const { generateApplicationMaterialsJsonFromJD } = require('../utils/resumeGeneration')
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
  const materials = await generateApplicationMaterialsJsonFromJD({ jd, profile, baseResume })
  const resume = materials.resume
  const coverLetter = materials.coverLetter
  updateProgress(80, { resume, coverLetter })

  await persistGeneratedResume({
    userId: job.userId,
    profileId,
    resume,
    coverLetter,
    sessionId,
    profileFullName: profile.fullName || null,
  }).catch(() => {})

  updateProgress(100, { resume, coverLetter })
  return { resume, coverLetter }
}
