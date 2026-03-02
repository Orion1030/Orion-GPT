require('dotenv').config()
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { ChatSessionModel, ChatMessageModel, ProfileModel, JobDescriptionModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')

const DEFAULT_TITLE = 'New Chat'

/** List all chat sessions for the authenticated user */
exports.listSessions = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const sessions = await ChatSessionModel.find({ userId })
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
    jobDescriptionId: s.jobDescriptionId ? s.jobDescriptionId.toString() : null
  }))
  return sendJsonResult(res, true, list, null, 200)
})

/** Create a new chat session */
exports.createSession = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { profileId, jobDescriptionId } = req.body || {}
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
  const session = new ChatSessionModel({
    userId,
    profileId: profileRef,
    title: DEFAULT_TITLE,
    jobDescriptionId: jdRef
  })
  await session.save()
  return sendJsonResult(res, true, {
    id: session._id.toString(),
    title: session.title,
    createdAt: session.createdAt ? new Date(session.createdAt).getTime() : Date.now(),
    profile: profileRef ? { id: profileRef.toString() } : null,
    jobDescriptionId: jdRef ? jdRef.toString() : null
  }, 'Chat created', 201)
})

/** Get one session and its messages (ownership checked) */
exports.getSession = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { sessionId } = req.params
  const session = await ChatSessionModel.findOne({ _id: sessionId, userId }).populate('profileId').lean()
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
    jobDescriptionId: session.jobDescriptionId ? session.jobDescriptionId.toString() : null
  }
  const messagesPayload = messages.map((m) => ({
    id: m._id.toString(),
    role: m.role,
    content: m.content,
    structuredAssistantPayload: m.structuredAssistantPayload ? m.structuredAssistantPayload : null
  }))
  return sendJsonResult(res, true, { session: sessionPayload, messages: messagesPayload }, null, 200)
})

/** Rename a session (and optionally update profileId, jobDescriptionId) */
exports.renameSession = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { sessionId } = req.params
  const { title, profileId, jobDescriptionId } = req.body || {}
  const updates = {}
  const trimmed = typeof title === 'string' ? title.trim() : ''
  if (trimmed) updates.title = trimmed
  if (profileId !== undefined) {
    if (profileId === null || profileId === '') {
      updates.profileId = null
    } else {
      const profile = await ProfileModel.findOne({ _id: profileId, userId })
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
      const jd = await JobDescriptionModel.findOne({ _id: jobDescriptionId, userId })
      if (jd) updates.jobDescriptionId = jd._id
    }
  }
  if (Object.keys(updates).length === 0) {
    return sendJsonResult(res, false, null, 'No updates provided', 400)
  }
  const session = await ChatSessionModel.findOneAndUpdate(
    { _id: sessionId, userId },
    { $set: updates },
    { new: true }
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
    jobDescriptionId: session.jobDescriptionId ? session.jobDescriptionId.toString() : null
  }, null, 200)
})

/** Delete a session and all its messages */
exports.deleteSession = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { sessionId } = req.params
  // Use deleteOne to make the operation idempotent: if the session doesn't exist
  // or already deleted, return success to the client to avoid noisy 404s on repeated deletes.
  const result = await ChatSessionModel.deleteOne({ _id: sessionId, userId })
  // Remove any messages tied to this session regardless.
  await ChatMessageModel.deleteMany({ sessionId })
  if (result && result.deletedCount && result.deletedCount > 0) {
    return sendJsonResult(res, true, null, 'Session deleted', 200)
  } else {
    // Session not found / already deleted — still return success for idempotency.
    return sendJsonResult(res, true, null, 'Session deleted', 200)
  }
})

/** Send a message: append user message, generate assistant reply, append and return updated messages */
exports.sendMessage = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { sessionId } = req.params
  const { content } = req.body
  const text = typeof content === 'string' ? content.trim() : ''
  if (!text) {
    return sendJsonResult(res, false, null, 'Message content is required', 400)
  }

  const session = await ChatSessionModel.findOne({ _id: sessionId, userId })
  if (!session) {
    return sendJsonResult(res, false, null, 'Session not found', 404)
  }

  const userMsg = new ChatMessageModel({ sessionId, role: 'user', content: text })
  await userMsg.save()

  const assistantContent = 'This is a placeholder reply. Connect your AI backend to get real responses.'
  const assistantMsg = new ChatMessageModel({ sessionId, role: 'assistant', content: assistantContent })
  await assistantMsg.save()

  if (session.title === DEFAULT_TITLE) {
    const firstLine = text.slice(0, 50).split('\n')[0].trim() || DEFAULT_TITLE
    await ChatSessionModel.updateOne({ _id: sessionId, userId }, { $set: { title: firstLine } })
  }

  const messages = await ChatMessageModel.find({ sessionId }).sort({ createdAt: 1 }).lean()
  const messagesPayload = messages.map((m) => ({
    id: m._id.toString(),
    role: m.role,
    content: m.content
  }))

  return sendJsonResult(res, true, { messages: messagesPayload }, null, 200)
})
