const { ChatMessageModel } = require('../dbModels')
const { findTopResumesCore } = require('../services/findTopResumes')

module.exports = async function atsScorer(job, updateProgress) {
  const { jdId, profileId, sessionId } = job.payload || {}
  if (!jdId) throw new Error('jdId required')
  const userId = job.userId
  if (!userId) throw new Error('userId required on job')

  updateProgress(20)
  const { topResumes, error } = await findTopResumesCore(userId, jdId, profileId)
  if (error) throw new Error(error)

  updateProgress(100, { topResumes })

  if (sessionId && topResumes.length) {
    const lines = topResumes.map((r, i) => `${i + 1}. ${r.resumeName} (Score: ${Math.round(r.atsScore)}%)`).join('\n')
    const assistantContent = `Top matching resumes:\n${lines}`
    try {
      await ChatMessageModel.create({
        sessionId,
        role: 'assistant',
        content: assistantContent,
        structuredAssistantPayload: { type: 'top_resumes', topResumes }
      })
    } catch (e) {}
  }
  return { topResumes }
}

