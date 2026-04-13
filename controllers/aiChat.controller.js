const fetch = global.fetch
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { ChatSessionModel, ChatMessageModel, ProfileModel, JobDescriptionModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')
const { isAdminUser } = require('../utils/access')
const { tryGetChatReply } = require('../services/llm/chatResponder.service')

const DEFAULT_TITLE = 'New Chat'

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
    .populate('profileId')
    .lean()
  const list = sessions.map((s) => ({
    id: s._id.toString(),
    title: s.title,
    createdAt: s.createdAt ? new Date(s.createdAt).getTime() : Date.now(),
    profile: s.profileId
      ? {
          id: s.profileId._id?.toString ? s.profileId._id.toString() : s.profileId._id,
          fullName: s.profileId.fullName || s.profileId.name || null,
          title: s.profileId.title || null
        }
      : null,
    jobDescriptionId: s.jobDescriptionId ? s.jobDescriptionId.toString() : null,
    chatType: s.chatType || 'normal'
  }))
  return sendJsonResult(res, true, list, null, 200)
})

const VALID_CHAT_TYPES = ['normal', 'jd', 'existing_resume']

/** Create a new chat session */
exports.createSession = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { profileId, jobDescriptionId, chatType } = req.body || {}
  let profileRef = null
  if (profileId) {
    const profile = await ProfileModel.findOne({ _id: profileId, userId })
    if (!profile) {
      return sendJsonResult(res, false, null, 'Profile not found', 404)
    }
    profileRef = profile._id
  }
  let jdRef = null
  if (jobDescriptionId) {
    const jd = await JobDescriptionModel.findOne({ _id: jobDescriptionId, userId })
    if (jd) jdRef = jd._id
  }
  const sessionChatType = VALID_CHAT_TYPES.includes(chatType) ? chatType : 'normal'
  const session = new ChatSessionModel({
    userId,
    profileId: profileRef,
    title: DEFAULT_TITLE,
    jobDescriptionId: jdRef,
    chatType: sessionChatType
  })
  await session.save()
  return sendJsonResult(res, true, {
    id: session._id.toString(),
    title: session.title,
    createdAt: session.createdAt ? new Date(session.createdAt).getTime() : Date.now(),
    profile: profileRef ? { id: profileRef.toString() } : null,
    jobDescriptionId: jdRef ? jdRef.toString() : null,
    chatType: session.chatType || 'normal'
  }, 'Chat created', 201)
})

/** Get one session and its messages (ownership checked) */
exports.getSession = asyncErrorHandler(async (req, res) => {
  const { sessionId } = req.params
  const session = await ChatSessionModel.findOne(buildChatScope(req, { _id: sessionId }))
    .populate('profileId')
    .lean()
  if (!session) {
    return sendJsonResult(res, false, null, 'Session not found', 404)
  }
  const messages = await ChatMessageModel.find({ sessionId }).sort({ createdAt: 1 }).lean()
  const sessionPayload = {
    id: session._id.toString(),
    title: session.title,
    createdAt: session.createdAt ? new Date(session.createdAt).getTime() : null,
    profile: session.profileId
      ? {
          id: session.profileId._id?.toString ? session.profileId._id.toString() : session.profileId._id,
          fullName: session.profileId.fullName || session.profileId.name || null,
          title: session.profileId.title || null
        }
      : null,
    jobDescriptionId: session.jobDescriptionId ? session.jobDescriptionId.toString() : null,
    chatType: session.chatType || 'normal'
  }
  const messagesPayload = messages.map((m) => ({
    id: m._id.toString(),
    role: m.role,
    content: m.content,
    structuredAssistantPayload: m.structuredAssistantPayload ? m.structuredAssistantPayload : null
  }))
  return sendJsonResult(res, true, { session: sessionPayload, messages: messagesPayload }, null, 200)
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
      const profile = await ProfileModel.findOne({ _id: profileId, userId: scopeUserId })
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
    .populate('profileId')
    .lean()
  if (!session) {
    return sendJsonResult(res, false, null, 'Session not found', 404)
  }
  return sendJsonResult(res, true, {
    id: session._id.toString(),
    title: session.title,
    createdAt: session.createdAt ? new Date(session.createdAt).getTime() : null,
    profile: session.profileId
      ? {
          id: session.profileId._id.toString(),
          fullName: session.profileId.fullName || null,
          title: session.profileId.title || null
        }
      : null,
    jobDescriptionId: session.jobDescriptionId ? session.jobDescriptionId.toString() : null,
    chatType: session.chatType || 'normal'
  }, null, 200)
})

/** Delete a session and all its messages */
exports.deleteSession = asyncErrorHandler(async (req, res) => {
  const { sessionId } = req.params
  // Use deleteOne to make the operation idempotent: if the session doesn't exist
  // or already deleted, return success to the client to avoid noisy 404s on repeated deletes.
  const result = await ChatSessionModel.deleteOne(buildChatScope(req, { _id: sessionId }))
  // Remove any messages tied to this session regardless.
  await ChatMessageModel.deleteMany({ sessionId })
  if (result && result.deletedCount && result.deletedCount > 0) {
    return sendJsonResult(res, true, null, 'Session deleted', 200)
  } else {
    // Session not found / already deleted — still return success for idempotency.
    return sendJsonResult(res, true, null, 'Session deleted', 200)
  }
})

/** Build system context from session (profile, JD, resume) for AI assistant */
async function buildSessionContext(session, userId) {
  const parts = ['You are a helpful resume and career assistant. Help the user improve their resume, tailor it to job descriptions, and answer questions about their career.']
  if (session.profileId) {
    const profile = await ProfileModel.findOne({ _id: session.profileId, userId }).lean()
    if (profile) {
      parts.push(`\nCurrent profile: ${profile.fullName || profile.name || 'Candidate'}, Title: ${profile.title || 'N/A'}.`)
      if (profile.careerHistory && profile.careerHistory.length) {
        parts.push(' Experiences: ' + profile.careerHistory.slice(0, 3).map(e => `${e.roleTitle} at ${e.companyName}`).join('; ') + '.')
      }
    }
  }
  if (session.jobDescriptionId) {
    const jd = await JobDescriptionModel.findOne({ _id: session.jobDescriptionId, userId }).lean()
    if (jd) {
      parts.push(`\nJob context: ${jd.title} at ${jd.company || 'Company'}. Skills: ${(jd.skills || []).slice(0, 10).join(', ')}.`)
    }
  }
  return parts.join('')
}

/** Send a message: append user message (or update and re-send if editMessageId), then generate assistant reply unless commandResend */
exports.sendMessage = asyncErrorHandler(async (req, res) => {
  const { sessionId } = req.params
  const { content, editMessageId, commandResend, sessionUpdates } = req.body || {}
  const text = typeof content === 'string' ? content.trim() : ''
  if (!text) {
    return sendJsonResult(res, false, null, 'Message content is required', 400)
  }

  const session = await ChatSessionModel.findOne(buildChatScope(req, { _id: sessionId }))
  if (!session) {
    return sendJsonResult(res, false, null, 'Session not found', 404)
  }
  const sessionUserId = session.userId || req.user._id

  let userMsg
  if (editMessageId) {
    const existing = await ChatMessageModel.findOne({ _id: editMessageId, sessionId }).lean()
    if (!existing) {
      return sendJsonResult(res, false, null, 'Message not found', 404)
    }
    if (existing.role !== 'user') {
      return sendJsonResult(res, false, null, 'Can only edit user messages', 400)
    }
    await ChatMessageModel.updateOne({ _id: editMessageId }, { $set: { content: text } })
    await ChatMessageModel.deleteMany({
      sessionId,
      createdAt: { $gt: existing.createdAt }
    })
    userMsg = { _id: existing._id, sessionId, role: 'user', content: text, createdAt: existing.createdAt }

    if (commandResend) {
      const sessionSet = {}
      if (sessionUpdates && sessionUpdates.profileId) sessionSet.profileId = sessionUpdates.profileId
      if (sessionUpdates && sessionUpdates.jobDescriptionId !== undefined) sessionSet.jobDescriptionId = sessionUpdates.jobDescriptionId
      if (sessionUpdates && sessionUpdates.chatType && VALID_CHAT_TYPES.includes(sessionUpdates.chatType)) sessionSet.chatType = sessionUpdates.chatType
      if (Object.keys(sessionSet).length > 0) {
        await ChatSessionModel.updateOne({ _id: sessionId, userId: sessionUserId }, { $set: sessionSet })
      }
      const messages = await ChatMessageModel.find({ sessionId }).sort({ createdAt: 1 }).lean()
      const messagesPayload = messages.map((m) => ({
        id: m._id.toString(),
        role: m.role,
        content: m.content,
        structuredAssistantPayload: m.structuredAssistantPayload || null
      }))
      return sendJsonResult(res, true, { messages: messagesPayload, commandResend: true }, null, 200)
    }
  } else {
    const newMsg = new ChatMessageModel({ sessionId, role: 'user', content: text })
    await newMsg.save()
    userMsg = newMsg
  }

  let assistantContent = 'I couldn\'t generate a reply right now. Please try again.'
  const systemContext = await buildSessionContext(session, sessionUserId)
  const recentMessages = await ChatMessageModel.find({ sessionId })
    .sort({ createdAt: 1 })
    .lean()
  const chatMessages = recentMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content || '' }))
  const apiMessages = [
    { role: 'system', content: systemContext },
    ...chatMessages.slice(-20)
  ]
  const { result: chatResult, error: chatError } = await tryGetChatReply({ messages: apiMessages, temperature: 0.6 })
  if (chatError) {
    assistantContent = 'Sorry, I had trouble responding. Please try again.'
  } else if (chatResult.reply) {
    assistantContent = chatResult.reply
  }

  const assistantMsg = new ChatMessageModel({ sessionId, role: 'assistant', content: assistantContent })
  await assistantMsg.save()

  if (session.title === DEFAULT_TITLE) {
    const firstLine = text.slice(0, 50).split('\n')[0].trim() || DEFAULT_TITLE
    await ChatSessionModel.updateOne({ _id: sessionId, userId: sessionUserId }, { $set: { title: firstLine } })
  }

  const messages = await ChatMessageModel.find({ sessionId }).sort({ createdAt: 1 }).lean()
  const messagesPayload = messages.map((m) => ({
    id: m._id.toString(),
    role: m.role,
    content: m.content,
    structuredAssistantPayload: m.structuredAssistantPayload || null
  }))

  return sendJsonResult(res, true, { messages: messagesPayload }, null, 200)
})
