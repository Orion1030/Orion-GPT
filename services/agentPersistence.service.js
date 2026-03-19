/**
 * Persistence operations triggered after agent work completes.
 * Keeps the agent layer free of direct DB writes and centralises
 * all side-effects (Resume creation, embedding refresh, ChatMessage) here.
 */
const { ResumeModel, ChatMessageModel } = require('../dbModels')
const { refreshResumeEmbedding } = require('./resumeEmbedding.service')

/**
 * Save a generated resume document and, when a chat session is active,
 * post an assistant message with the structured payload.
 */
async function persistGeneratedResume({ userId, profileId, resume, sessionId, profileFullName }) {
  const doc = new ResumeModel({
    userId,
    name: resume.name,
    profileId,
    summary: resume.summary || '',
    experiences: Array.isArray(resume.experiences) ? resume.experiences : [],
    skills: Array.isArray(resume.skills) ? resume.skills : [],
    pageFrameConfig: resume.pageFrameConfig || null,
  })
  await doc.save()
  await refreshResumeEmbedding(doc._id).catch(() => {})

  if (sessionId) {
    await ChatMessageModel.create({
      sessionId,
      role: 'assistant',
      content: resume.summary || doc.name,
      structuredAssistantPayload: {
        type: 'generated_resume',
        resumeId: doc._id.toString(),
        resumeName: doc.name,
        profileName: profileFullName || null,
      },
    }).catch(() => {})
  }

  return { savedResumeId: doc._id.toString() }
}

/**
 * Post an assistant message listing the top-matched resumes when a
 * chat session is active.
 */
async function persistTopResumesMessage({ sessionId, topResumes }) {
  if (!sessionId || !topResumes?.length) return

  const lines = topResumes
    .map((r, i) => `${i + 1}. ${r.resumeName} (Score: ${Math.round(r.atsScore)}%)`)
    .join('\n')

  await ChatMessageModel.create({
    sessionId,
    role: 'assistant',
    content: `Top matching resumes:\n${lines}`,
    structuredAssistantPayload: { type: 'top_resumes', topResumes },
  }).catch(() => {})
}

module.exports = { persistGeneratedResume, persistTopResumesMessage }
