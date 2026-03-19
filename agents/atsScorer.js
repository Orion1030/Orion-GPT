const { findTopResumesCore } = require('../services/findTopResumes')
const { persistTopResumesMessage } = require('../services/agentPersistence.service')

module.exports = async function atsScorer(job, updateProgress) {
  const { jdId, profileId, sessionId } = job.payload || {}
  if (!jdId) throw new Error('jdId required')

  const userId = job.userId
  if (!userId) throw new Error('userId required on job')

  updateProgress(20)
  const { topResumes, error } = await findTopResumesCore(userId, jdId, profileId)
  if (error) throw new Error(error)

  updateProgress(90, { topResumes })

  await persistTopResumesMessage({ sessionId, topResumes }).catch(() => {})

  updateProgress(100, { topResumes })
  return { topResumes }
}
