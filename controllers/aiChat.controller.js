const crypto = require('crypto')
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const {
  ApplicationModel,
  ChatSessionModel,
  ChatMessageModel,
  ProfileModel,
  JobDescriptionModel,
  ResumeModel,
} = require('../dbModels')
const { sendJsonResult } = require('../utils')
const { isAdminUser } = require('../utils/access')
const { RoleLevels } = require('../utils/constants')
const { AI_CHAT_MODEL } = require('../config/llm')
const { createContextToken, createTurnToken, readTurnToken } = require('../services/aiChatTurnToken.service')
const { streamChatReply } = require('../services/llm/chatResponder.service')
const { isAbortError } = require('../services/llm/streamingUtils')
const { buildReadableProfileFilterForUser } = require('../services/profileAccess.service')

const DEFAULT_TITLE = 'New Chat'
const AI_CHAT_CONTEXT_HISTORY_LIMIT = 60
const AI_CHAT_PROMPT_HISTORY_LIMIT = 20
const AI_CHAT_CONTEXT_TOKEN_TTL_MS = 30 * 60 * 1000
const ORION_INTERVIEW_SYSTEM_PROMPT = [
  'You are a senior software engineer and career assistant helping with interviews, applications, and resume tailoring.',
  'Answer naturally like a real person. Use spoken English, short clear sentences, and easy-to-pronounce words.',
  'Put the main point first. When helpful, include a practical example from the provided profile, resume, or job context.',
  'Do not say the candidate has no experience with a topic. Use the provided context to form a credible answer, and call out missing facts only when they materially matter.',
].join(' ')

function toIdString(value) {
  if (!value) return null
  if (value._id) return value._id.toString()
  return value.toString ? value.toString() : String(value)
}

function truncateText(value, maxLength = 3000) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength).trim()}...`
}

function buildApplicationChatTitle(application) {
  const jobTitle = typeof application?.jobTitle === 'string' ? application.jobTitle.trim() : ''
  const companyName = typeof application?.companyName === 'string' ? application.companyName.trim() : ''
  const title = [jobTitle, companyName ? `at ${companyName}` : ''].filter(Boolean).join(' ')
  return title || DEFAULT_TITLE
}

function mapProfilePayload(profileRef) {
  if (!profileRef || !profileRef._id) return null
  return {
    id: toIdString(profileRef._id),
    fullName: profileRef.fullName || profileRef.name || null,
    title: profileRef.title || null,
  }
}

function mapApplicationPayload(applicationRef) {
  if (!applicationRef || !applicationRef._id) return null
  return {
    id: toIdString(applicationRef._id),
    companyName: applicationRef.companyName || '',
    jobTitle: applicationRef.jobTitle || '',
    applicationStatus: applicationRef.applicationStatus || null,
    generationStatus: applicationRef.generationStatus || null,
  }
}

function mapResumePayload(resumeRef) {
  if (!resumeRef || !resumeRef._id) return null
  return {
    id: toIdString(resumeRef._id),
    name: resumeRef.name || '',
  }
}

function mapSessionPayload(session) {
  const profile = mapProfilePayload(session.profileId)
  const application = mapApplicationPayload(session.applicationId)
  const resume = mapResumePayload(session.resumeId)
  return {
    id: toIdString(session._id),
    title: session.title,
    createdAt: session.createdAt ? new Date(session.createdAt).getTime() : Date.now(),
    profile,
    jobDescriptionId: toIdString(session.jobDescriptionId),
    applicationId: toIdString(session.applicationId),
    application,
    resumeId: toIdString(session.resumeId),
    resume,
    chatType: session.chatType || 'normal',
  }
}

function mapMessagePayload(message) {
  return {
    id: toIdString(message._id),
    role: message.role,
    content: message.content,
    structuredAssistantPayload: message.structuredAssistantPayload || null
  }
}

async function loadMessagesPayload(sessionId) {
  const messages = await ChatMessageModel.find({ sessionId }).sort({ createdAt: 1 }).lean()
  return messages.map(mapMessagePayload)
}

async function loadScopedSessionPayload(req, sessionId) {
  const session = await ChatSessionModel.findOne(buildChatScope(req, { _id: sessionId }))
    .populate('profileId', 'fullName name title')
    .populate('applicationId', 'companyName jobTitle applicationStatus generationStatus')
    .populate('resumeId', 'name')
    .lean()
  return session ? mapSessionPayload(session) : null
}

function toTargetUserId(req) {
  const fromQuery = req.query?.userId
  if (typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim()
  const fromBody = req.body?.userId
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim()
  return null
}

function toBooleanQuery(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function buildChatScope(req, extras = {}) {
  const user = req.user
  if (!isAdminUser(user)) {
    return { userId: user._id, ...extras }
  }

  const targetUserId = toTargetUserId(req)
  const includeOtherUsers = toBooleanQuery(
    req.query?.includeOtherUsers ?? req.body?.includeOtherUsers,
    false
  )

  if (targetUserId) return { userId: targetUserId, ...extras }
  if (includeOtherUsers) return { ...extras }
  return { userId: user._id, ...extras }
}

/** List all chat sessions for the authenticated user */
exports.listSessions = asyncErrorHandler(async (req, res) => {
  const sessions = await ChatSessionModel.find(buildChatScope(req))
    .sort({ updatedAt: -1 })
    .populate('profileId', 'fullName name title')
    .populate('applicationId', 'companyName jobTitle applicationStatus generationStatus')
    .populate('resumeId', 'name')
    .lean()
  const list = sessions.map(mapSessionPayload)
  return sendJsonResult(res, true, list, null, 200)
})

const VALID_CHAT_TYPES = ['normal', 'jd', 'existing_resume']

/** Create a new chat session */
exports.createSession = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { profileId, jobDescriptionId, chatType, applicationId, resumeId } = req.body || {}
  let applicationRef = null
  let application = null
  if (applicationId) {
    application = await ApplicationModel.findOne({ _id: applicationId, userId }).lean()
    if (!application) {
      return sendJsonResult(res, false, null, 'Application not found', 404)
    }
    applicationRef = application._id
  }

  const effectiveProfileId = profileId || application?.profileId || null
  const effectiveJobDescriptionId = jobDescriptionId || application?.jobDescriptionId || null
  const effectiveResumeId = resumeId || application?.resumeId || null

  let profileRef = null
  if (effectiveProfileId) {
    const profile = await ProfileModel.findOne(
      await buildReadableProfileFilterForUser(
        userId,
        { _id: effectiveProfileId },
        { isGuest: Number(req.user?.role) === RoleLevels.GUEST }
      )
    )
    if (!profile) {
      return sendJsonResult(res, false, null, 'Profile not found', 404)
    }
    profileRef = profile._id
  }
  let jdRef = null
  if (effectiveJobDescriptionId) {
    const jd = await JobDescriptionModel.findOne({ _id: effectiveJobDescriptionId, userId })
    if (jd) jdRef = jd._id
  }
  let resumeRef = null
  if (effectiveResumeId) {
    const resume = await ResumeModel.findOne({
      _id: effectiveResumeId,
      userId,
      isDeleted: { $ne: true },
    })
      .select('_id')
      .lean()
    if (resume) resumeRef = resume._id
  }
  const sessionChatType = VALID_CHAT_TYPES.includes(chatType)
    ? chatType
    : jdRef || applicationRef
      ? 'jd'
      : 'normal'
  const session = new ChatSessionModel({
    userId,
    profileId: profileRef,
    title: application ? buildApplicationChatTitle(application) : DEFAULT_TITLE,
    jobDescriptionId: jdRef,
    applicationId: applicationRef,
    resumeId: resumeRef,
    chatType: sessionChatType
  })
  await session.save()
  const sessionForPayload = {
    ...session.toObject(),
    profileId: profileRef ? { _id: profileRef } : null,
    applicationId: applicationRef ? { _id: applicationRef, ...application } : null,
    resumeId: resumeRef ? { _id: resumeRef } : null,
  }
  const contextToken = await buildContextTokenForSession(req, session, userId, session._id, [])
  return sendJsonResult(res, true, {
    ...mapSessionPayload(sessionForPayload),
    contextToken,
  }, 'Chat created', 201)
})

/** Get one session and its messages (ownership checked) */
exports.getSession = asyncErrorHandler(async (req, res) => {
  const { sessionId } = req.params
  const session = await ChatSessionModel.findOne(buildChatScope(req, { _id: sessionId }))
    .populate('profileId', 'fullName name title')
    .populate('applicationId', 'companyName jobTitle applicationStatus generationStatus')
    .populate('resumeId', 'name')
    .lean()
  if (!session) {
    return sendJsonResult(res, false, null, 'Session not found', 404)
  }
  const messages = await ChatMessageModel.find({ sessionId }).sort({ createdAt: 1 }).lean()
  const sessionPayload = mapSessionPayload(session)
  const messagesPayload = messages.map(mapMessagePayload)
  const contextToken = await buildContextTokenForSession(
    req,
    session,
    session.userId || req.user._id,
    sessionId,
    messages
  )
  return sendJsonResult(res, true, {
    session: sessionPayload,
    messages: messagesPayload,
    contextToken,
  }, null, 200)
})

/** Rename a session (and optionally update profileId, jobDescriptionId, chatType) */
exports.renameSession = asyncErrorHandler(async (req, res) => {
  const { sessionId } = req.params
  const { title, profileId, jobDescriptionId, chatType } = req.body || {}
  const existingSession = await ChatSessionModel.findOne(
    buildChatScope(req, { _id: sessionId })
  )
    .select('_id userId')
    .lean()
  if (!existingSession) {
    return sendJsonResult(res, false, null, 'Session not found', 404)
  }
  const scopeUserId = existingSession.userId
  const updates = {}
  const trimmed = typeof title === 'string' ? title.trim() : ''
  if (trimmed) updates.title = trimmed
  if (profileId !== undefined) {
    if (profileId === null || profileId === '') {
      updates.profileId = null
    } else {
      const profile = await ProfileModel.findOne(
        await buildReadableProfileFilterForUser(scopeUserId, { _id: profileId })
      )
      if (!profile) {
        return sendJsonResult(res, false, null, 'Profile not found', 404)
      }
      updates.profileId = profile._id
    }
  }
  if (jobDescriptionId !== undefined) {
    if (jobDescriptionId === null || jobDescriptionId === '') {
      updates.jobDescriptionId = null
    } else {
      const jd = await JobDescriptionModel.findOne({ _id: jobDescriptionId, userId: scopeUserId })
      if (jd) updates.jobDescriptionId = jd._id
    }
  }
  if (chatType !== undefined && VALID_CHAT_TYPES.includes(chatType)) {
    updates.chatType = chatType
  }
  if (Object.keys(updates).length === 0) {
    return sendJsonResult(res, false, null, 'No updates provided', 400)
  }
  const session = await ChatSessionModel.findOneAndUpdate(
    { _id: sessionId, userId: scopeUserId },
    { $set: updates },
    { returnDocument: 'after' }
  )
    .populate('profileId', 'fullName name title')
    .populate('applicationId', 'companyName jobTitle applicationStatus generationStatus')
    .populate('resumeId', 'name')
    .lean()
  if (!session) {
    return sendJsonResult(res, false, null, 'Session not found', 404)
  }
  return sendJsonResult(res, true, mapSessionPayload(session), null, 200)
})

/** Delete a session and all its messages */
exports.deleteSession = asyncErrorHandler(async (req, res) => {
  const { sessionId } = req.params
  const session = await ChatSessionModel.findOne(buildChatScope(req, { _id: sessionId }))
    .select('_id')
    .lean()

  if (!session) {
    return sendJsonResult(res, true, null, 'Session deleted', 200)
  }

  await ChatSessionModel.deleteOne({ _id: session._id })
  await ChatMessageModel.deleteMany({ sessionId: session._id })
  return sendJsonResult(res, true, null, 'Session deleted', 200)
})

/** Build system context from session (profile, JD, resume) for AI assistant */
async function buildSessionContext(session, userId) {
  const parts = [ORION_INTERVIEW_SYSTEM_PROMPT]
  let application = null
  if (session.applicationId) {
    application = await ApplicationModel.findOne({ _id: session.applicationId, userId }).lean()
    if (application) {
      parts.push(`\nApplication context: ${application.jobTitle || 'Role'} at ${application.companyName || 'Company'}. Application status: ${application.applicationStatus || 'unknown'}. Resume generation status: ${application.generationStatus || 'unknown'}.`)
      if (application.jdContext) {
        parts.push(`Original job post/context:\n${truncateText(application.jdContext, 3500)}`)
      }
    }
  }

  const effectiveProfileId = session.profileId || application?.profileId || null
  const effectiveJobDescriptionId = session.jobDescriptionId || application?.jobDescriptionId || null
  const effectiveResumeId = session.resumeId || application?.resumeId || null

  const profilePromise = effectiveProfileId
    ? buildReadableProfileFilterForUser(userId, { _id: effectiveProfileId })
        .then((filter) => ProfileModel.findOne(filter).lean())
    : Promise.resolve(null)
  const jdPromise = effectiveJobDescriptionId
    ? JobDescriptionModel.findOne({ _id: effectiveJobDescriptionId, userId }).lean()
    : Promise.resolve(null)
  const resumePromise = effectiveResumeId
    ? ResumeModel.findOne({
        _id: effectiveResumeId,
        userId,
        isDeleted: { $ne: true },
      }).lean()
    : Promise.resolve(null)

  const [profile, jd, resume] = await Promise.all([
    profilePromise,
    jdPromise,
    resumePromise,
  ])

  if (profile) {
    parts.push(`\nCandidate profile: ${profile.fullName || profile.name || 'Candidate'}, Title: ${profile.title || 'N/A'}, Main stack: ${profile.mainStack || 'N/A'}.`)
    if (profile.careerHistory && profile.careerHistory.length) {
      parts.push('Profile experience: ' + profile.careerHistory.slice(0, 5).map((e) => {
        const details = truncateText(e.keyPoints || e.companySummary || '', 500)
        return `${e.roleTitle} at ${e.companyName}${details ? ` (${details})` : ''}`
      }).join('; ') + '.')
    }
  }
  if (jd) {
    parts.push(`\nJob description: ${jd.title} at ${jd.company || 'Company'}.`)
    if (jd.skills && jd.skills.length) {
      parts.push(`Required/relevant skills: ${jd.skills.slice(0, 16).join(', ')}.`)
    }
    if (jd.requirements && jd.requirements.length) {
      parts.push(`Requirements: ${jd.requirements.slice(0, 8).join('; ')}.`)
    }
    if (jd.responsibilities && jd.responsibilities.length) {
      parts.push(`Responsibilities: ${jd.responsibilities.slice(0, 8).join('; ')}.`)
    }
    if (jd.context) {
      parts.push(`Full JD excerpt:\n${truncateText(jd.context, 3500)}`)
    }
  }
  if (resume) {
    parts.push(`\nResume context: ${resume.name || 'Resume'}. Summary: ${truncateText(resume.summary || '', 1200) || 'N/A'}.`)
    const skillGroups = Array.isArray(resume.skills)
      ? resume.skills
          .slice(0, 8)
          .map((group) => `${group.title || 'Skills'}: ${(group.items || []).slice(0, 20).join(', ')}`)
          .filter((item) => item.trim() !== 'Skills:')
      : []
    if (skillGroups.length) {
      parts.push(`Resume skills: ${skillGroups.join('; ')}.`)
    }
    if (Array.isArray(resume.experiences) && resume.experiences.length) {
      parts.push('Resume experience bullets: ' + resume.experiences.slice(0, 5).map((experience) => {
        const experienceBullets = Array.isArray(experience.bullets)
          ? experience.bullets
          : Array.isArray(experience.descriptions)
            ? experience.descriptions
            : []
        const bullets = experienceBullets.length
          ? experienceBullets.slice(0, 5).map((item) => truncateText(item, 300)).join(' | ')
          : ''
        return `${experience.title || 'Role'} at ${experience.companyName || 'Company'}${bullets ? `: ${bullets}` : ''}`
      }).join('\n'))
    }
  }
  return parts.join('')
}

async function applyCommandSessionUpdates(sessionId, sessionUserId, sessionUpdates) {
  const sessionSet = {}
  if (sessionUpdates && sessionUpdates.profileId) sessionSet.profileId = sessionUpdates.profileId
  if (sessionUpdates && sessionUpdates.jobDescriptionId !== undefined) sessionSet.jobDescriptionId = sessionUpdates.jobDescriptionId
  if (sessionUpdates && sessionUpdates.applicationId !== undefined) sessionSet.applicationId = sessionUpdates.applicationId
  if (sessionUpdates && sessionUpdates.resumeId !== undefined) sessionSet.resumeId = sessionUpdates.resumeId
  if (sessionUpdates && sessionUpdates.chatType && VALID_CHAT_TYPES.includes(sessionUpdates.chatType)) sessionSet.chatType = sessionUpdates.chatType
  if (Object.keys(sessionSet).length > 0) {
    await ChatSessionModel.updateOne({ _id: sessionId, userId: sessionUserId }, { $set: sessionSet })
  }
}

function buildApiMessagesFromHistory(systemContext, recentMessages) {
  const chatMessages = recentMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: truncateText(m.content || '', 6000) }))
  return [
    { role: 'system', content: systemContext },
    ...chatMessages.slice(-AI_CHAT_PROMPT_HISTORY_LIMIT)
  ]
}

function mapContextMessagePayload(message) {
  return {
    id: toIdString(message._id || message.id),
    role: message.role,
    content: truncateText(message.content || '', 6000),
  }
}

async function buildContextTokenForSession(req, session, sessionUserId, sessionId, existingMessages = null) {
  const effectiveSessionId = String(toIdString(sessionId || session?._id))
  const effectiveSessionUserId = String(toIdString(sessionUserId || session?.userId || req.user?._id))
  const [systemContext, recentMessages] = await Promise.all([
    buildSessionContext(session, effectiveSessionUserId),
    Array.isArray(existingMessages)
      ? Promise.resolve(existingMessages)
      : ChatMessageModel.find({ sessionId: effectiveSessionId }).sort({ createdAt: 1 }).lean(),
  ])

  return createContextToken({
    sessionId: effectiveSessionId,
    sessionUserId: effectiveSessionUserId,
    actorUserId: String(toIdString(req.user?._id)),
    systemContext,
    messages: recentMessages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-AI_CHAT_CONTEXT_HISTORY_LIMIT)
      .map(mapContextMessagePayload),
    model: AI_CHAT_MODEL,
  }, { ttlMs: AI_CHAT_CONTEXT_TOKEN_TTL_MS })
}

async function buildApiMessagesForPendingTurn(session, sessionUserId, sessionId, text, editMessageId) {
  const [systemContext, recentMessages] = await Promise.all([
    buildSessionContext(session, sessionUserId),
    ChatMessageModel.find({ sessionId })
      .sort({ createdAt: 1 })
      .lean(),
  ])

  let pendingHistory = recentMessages
  if (editMessageId) {
    const editIndex = recentMessages.findIndex((message) => toIdString(message._id) === String(editMessageId))
    if (editIndex === -1) {
      return { error: { status: 404, message: 'Message not found' } }
    }
    const existing = recentMessages[editIndex]
    if (existing.role !== 'user') {
      return { error: { status: 400, message: 'Can only edit user messages' } }
    }
    pendingHistory = recentMessages
      .slice(0, editIndex + 1)
      .map((message, index) => (
        index === editIndex
          ? { ...message, content: text }
          : message
      ))
  } else {
    pendingHistory = [
      ...recentMessages,
      { _id: `pending-${crypto.randomUUID()}`, role: 'user', content: text },
    ]
  }

  return {
    apiMessages: buildApiMessagesFromHistory(systemContext, pendingHistory),
  }
}

async function updateSessionTitleFromFirstMessage(session, sessionId, sessionUserId, text) {
  if (session.title !== DEFAULT_TITLE) return null
  const firstLine = text.slice(0, 50).split('\n')[0].trim() || DEFAULT_TITLE
  const updatedSession = await ChatSessionModel.findOneAndUpdate(
    { _id: sessionId, userId: sessionUserId },
    { $set: { title: firstLine } },
    { returnDocument: 'after' }
  )
    .populate('profileId', 'fullName name title')
    .populate('applicationId', 'companyName jobTitle applicationStatus generationStatus')
    .populate('resumeId', 'name')
    .lean()
  return updatedSession ? mapSessionPayload(updatedSession) : null
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001)
}

function didInsertUpsert(result) {
  return Boolean(result?.upsertedCount || result?.upsertedId)
}

async function upsertTurnMessage({ sessionId, turnId, role, content }) {
  try {
    return await ChatMessageModel.updateOne(
      { sessionId, turnId, role },
      {
        $setOnInsert: {
          sessionId,
          turnId,
          role,
          content,
          structuredAssistantPayload: null,
        },
      },
      { upsert: true }
    )
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { acknowledged: true, matchedCount: 1, modifiedCount: 0, upsertedCount: 0 }
    }
    throw error
  }
}

function buildTokenError(message, status = 400) {
  return { error: { status, message } }
}

function readTurnForRequest(req, sessionId) {
  try {
    const turn = readTurnToken(req.body?.turnToken)
    if (String(turn.sessionId) !== String(sessionId)) {
      return buildTokenError('Turn token does not match this session', 400)
    }
    if (String(turn.actorUserId) !== String(toIdString(req.user?._id))) {
      return buildTokenError('Turn token does not match this user', 403)
    }
    if (!turn.turnId || !Array.isArray(turn.apiMessages)) {
      return buildTokenError('Invalid turn token', 400)
    }
    return { turn }
  } catch (error) {
    return buildTokenError(error.message || 'Invalid turn token', error.statusCode || 400)
  }
}

async function prepareStreamingChatTurn(req, sessionId, options = {}) {
  const { content, editMessageId, commandResend, sessionUpdates } = req.body || {}
  const text = typeof content === 'string' ? content.trim() : ''
  if (!text) {
    return { error: { status: 400, message: 'Message content is required' } }
  }

  const session = await ChatSessionModel.findOne(buildChatScope(req, { _id: sessionId }))
  if (!session) {
    return { error: { status: 404, message: 'Session not found' } }
  }

  const sessionUserId = session.userId || req.user._id

  if (commandResend) {
    await applyCommandSessionUpdates(sessionId, sessionUserId, sessionUpdates)
    return {
      commandResend: true,
      messages: await loadMessagesPayload(sessionId),
      session: await loadScopedSessionPayload(req, sessionId),
    }
  }

  const preparedMessages = await buildApiMessagesForPendingTurn(
    session,
    sessionUserId,
    sessionId,
    text,
    editMessageId
  )
  if (preparedMessages.error) return preparedMessages

  const turnId = options.turnId || crypto.randomUUID()
  const assistantMessageId = options.assistantMessageId || `stream-${turnId}`
  const userMessageId = editMessageId ? String(editMessageId) : `pending-${turnId}`
  const turnToken = createTurnToken({
    turnId,
    sessionId: String(sessionId),
    sessionUserId: String(toIdString(sessionUserId)),
    actorUserId: String(toIdString(req.user._id)),
    text,
    editMessageId: editMessageId ? String(editMessageId) : null,
    assistantMessageId,
    apiMessages: preparedMessages.apiMessages,
    model: AI_CHAT_MODEL,
  })

  return {
    turnId,
    turnToken,
    userMessage: { id: userMessageId, role: 'user', content: text, structuredAssistantPayload: null },
    assistantMessage: { id: assistantMessageId, role: 'assistant', content: '', structuredAssistantPayload: null },
  }
}

async function commitPreparedChatTurn(req, sessionId) {
  const parsed = readTurnForRequest(req, sessionId)
  if (parsed.error) return parsed

  const { turn } = parsed
  let changed = false
  const assistantContent = typeof req.body?.assistantContent === 'string'
    ? req.body.assistantContent.trim()
    : ''
  const cancelled = Boolean(req.body?.cancelled)

  if (!assistantContent && !cancelled) {
    return { error: { status: 400, message: 'Assistant content is required' } }
  }

  const session = await ChatSessionModel.findOne(buildChatScope(req, { _id: sessionId }))
  if (!session) {
    return { error: { status: 404, message: 'Session not found' } }
  }
  const sessionUserId = session.userId || req.user._id
  if (String(toIdString(sessionUserId)) !== String(turn.sessionUserId)) {
    return { error: { status: 403, message: 'Turn token does not match this session owner' } }
  }

  const existingAssistant = await ChatMessageModel.findOne({
    sessionId,
    turnId: turn.turnId,
    role: 'assistant',
  }).lean()
  if (existingAssistant) {
    const messages = await loadMessagesPayload(sessionId)
    return {
      messages,
      committed: false,
      contextToken: await buildContextTokenForSession(req, session, sessionUserId, sessionId, messages),
    }
  }

  if (turn.editMessageId) {
    const existing = await ChatMessageModel.findOne({ _id: turn.editMessageId, sessionId }).lean()
    if (!existing) {
      return { error: { status: 404, message: 'Message not found' } }
    }
    if (existing.role !== 'user') {
      return { error: { status: 400, message: 'Can only edit user messages' } }
    }
    await ChatMessageModel.updateOne(
      { _id: turn.editMessageId },
      { $set: { content: turn.text, turnId: turn.turnId } }
    )
    changed = true
    const deleteResult = await ChatMessageModel.deleteMany({
      sessionId,
      createdAt: { $gt: existing.createdAt }
    })
    if (deleteResult?.deletedCount) changed = true
  } else {
    const userResult = await upsertTurnMessage({
      sessionId,
      turnId: turn.turnId,
      role: 'user',
      content: turn.text,
    })
    if (didInsertUpsert(userResult)) changed = true
  }

  if (assistantContent) {
    const assistantResult = await upsertTurnMessage({
      sessionId,
      turnId: turn.turnId,
      role: 'assistant',
      content: assistantContent,
    })
    if (didInsertUpsert(assistantResult)) changed = true
  }

  const updatedSession = await updateSessionTitleFromFirstMessage(
    session,
    sessionId,
    sessionUserId,
    turn.text
  )

  const messages = await loadMessagesPayload(sessionId)
  const result = {
    messages,
    committed: changed,
    contextToken: await buildContextTokenForSession(req, session, sessionUserId, sessionId, messages),
  }
  if (updatedSession) result.session = updatedSession
  return result
}

exports.handleMessageTurn = asyncErrorHandler(async (req, res) => {
  const { sessionId } = req.params
  const action = typeof req.body?.action === 'string' ? req.body.action.trim() : ''

  if (action === 'prepare') {
    const prepared = await prepareStreamingChatTurn(req, sessionId)
    if (prepared.error) {
      return sendJsonResult(res, false, null, prepared.error.message, prepared.error.status)
    }
    return sendJsonResult(res, true, prepared, null, 200)
  }

  if (action === 'commit') {
    const committed = await commitPreparedChatTurn(req, sessionId)
    if (committed.error) {
      return sendJsonResult(res, false, null, committed.error.message, committed.error.status)
    }
    return sendJsonResult(res, true, committed, null, 200)
  }

  return sendJsonResult(res, false, null, 'Unsupported chat turn action', 400)
})

function writeSseEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
  if (typeof res.flush === 'function') {
    res.flush()
  }
}

function canWriteSse(res) {
  return !res.writableEnded && !res.destroyed
}

/** Stream a prepared message response over SSE. Persistence happens in the turn endpoint. */
exports.streamMessage = async (req, res) => {
  const { sessionId } = req.params
  const abortController = new AbortController()
  let keepAlive = null
  let clientClosed = false

  const closeHandler = () => {
    if (!res.writableEnded) {
      clientClosed = true
      abortController.abort()
    }
  }
  req.on('close', closeHandler)

  try {
    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders()
    }
    if (res.socket && typeof res.socket.setNoDelay === 'function') {
      res.socket.setNoDelay(true)
    }

    writeSseEvent(res, { type: 'ready' })

    keepAlive = setInterval(() => {
      if (canWriteSse(res)) res.write(': keep-alive\n\n')
    }, 15000)

    let turnToken = typeof req.body?.turnToken === 'string' ? req.body.turnToken : ''
    let turn = null
    const hasPreparedToken = Boolean(turnToken)
    const immediateTurnId = hasPreparedToken ? null : crypto.randomUUID()
    const assistantTempId = hasPreparedToken ? null : `stream-${immediateTurnId}`
    let assistantContent = ''

    if (!hasPreparedToken) {
      const text = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
      if (!text) {
        writeSseEvent(res, {
          type: 'error',
          message: 'Message content is required',
          status: 400,
        })
        writeSseEvent(res, { type: 'done', error: true })
        return
      }

      writeSseEvent(res, {
        type: 'assistant_start',
        message: { id: assistantTempId, role: 'assistant', content: '' },
      })

      const prepared = await prepareStreamingChatTurn(req, sessionId, {
        turnId: immediateTurnId,
        assistantMessageId: assistantTempId,
      })
      if (prepared.error) {
        writeSseEvent(res, {
          type: 'error',
          message: prepared.error.message,
          status: prepared.error.status,
        })
        writeSseEvent(res, { type: 'done', error: true })
        return
      }
      if (prepared.commandResend) {
        writeSseEvent(res, {
          type: 'done',
          commandResend: true,
          messages: prepared.messages,
          session: prepared.session,
        })
        return
      }

      turnToken = prepared.turnToken
      if (prepared.userMessage) {
        writeSseEvent(res, { type: 'user_message', message: prepared.userMessage })
      }
      writeSseEvent(res, {
        type: 'turn_prepared',
        turnId: prepared.turnId,
        turnToken,
      })
    }

    const parsed = readTurnForRequest({ ...req, body: { ...req.body, turnToken } }, sessionId)
    if (parsed.error) {
      writeSseEvent(res, {
        type: 'error',
        message: parsed.error.message,
        status: parsed.error.status,
      })
      writeSseEvent(res, { type: 'done', error: true })
      return
    }

    turn = parsed.turn
    const assistantMessageId = turn.assistantMessageId || assistantTempId || `stream-${turn.turnId}`

    if (hasPreparedToken) {
      writeSseEvent(res, {
        type: 'assistant_start',
        message: { id: assistantMessageId, role: 'assistant', content: '' },
      })
    }

    try {
      for await (const token of streamChatReply({
        messages: turn.apiMessages,
        temperature: 0.6,
        signal: abortController.signal,
        model: AI_CHAT_MODEL,
        forceBuiltIn: true,
      })) {
        if (!token) continue
        assistantContent += token
        if (canWriteSse(res)) {
          writeSseEvent(res, { type: 'token', token })
        }
      }

      const finalContent = assistantContent.trim() || 'Sorry, I had trouble responding. Please try again.'

      if (canWriteSse(res)) {
        writeSseEvent(res, {
          type: 'assistant_done',
          turnId: turn.turnId,
          turnToken,
          assistantContent: finalContent,
          message: { id: assistantMessageId, role: 'assistant', content: finalContent },
        })
        writeSseEvent(res, { type: 'done', turnId: turn.turnId, turnToken, assistantContent: finalContent })
      }
    } catch (error) {
      const wasCancelled = abortController.signal.aborted || isAbortError(error)
      const partialContent = assistantContent.trim()

      if (partialContent) {
        if (canWriteSse(res) && !clientClosed) {
          writeSseEvent(res, {
            type: 'assistant_done',
            cancelled: wasCancelled,
            error: !wasCancelled,
            turnId: turn.turnId,
            turnToken,
            assistantContent: partialContent,
            message: { id: assistantMessageId, role: 'assistant', content: partialContent },
          })
          writeSseEvent(res, {
            type: 'done',
            cancelled: wasCancelled,
            error: !wasCancelled,
            turnId: turn.turnId,
            turnToken,
            assistantContent: partialContent,
          })
        }
        return
      }

      if (canWriteSse(res) && !clientClosed) {
        writeSseEvent(res, {
          type: 'error',
          message: wasCancelled
            ? 'Generation stopped.'
            : 'Sorry, I had trouble responding. Please try again.',
        })
      }

      if (!wasCancelled && !partialContent) {
        const fallbackContent = 'Sorry, I had trouble responding. Please try again.'
        if (canWriteSse(res) && !clientClosed) {
          writeSseEvent(res, {
            type: 'assistant_done',
            turnId: turn.turnId,
            turnToken,
            assistantContent: fallbackContent,
            message: { id: assistantMessageId, role: 'assistant', content: fallbackContent },
          })
          writeSseEvent(res, {
            type: 'done',
            error: true,
            turnId: turn.turnId,
            turnToken,
            assistantContent: fallbackContent,
          })
        }
      }
    }
  } catch (error) {
    if (!res.headersSent) {
      return sendJsonResult(res, false, null, 'Chat stream failed', 500)
    }
    if (canWriteSse(res) && !clientClosed) {
      writeSseEvent(res, {
        type: 'error',
        message: 'Chat stream failed',
      })
    }
  } finally {
    req.removeListener('close', closeHandler)
    if (keepAlive) clearInterval(keepAlive)
    if (canWriteSse(res)) {
      res.end()
    }
  }
}
