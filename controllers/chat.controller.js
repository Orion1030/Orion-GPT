require('dotenv').config()
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { ChatSessionModel, ChatMessageModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')

const DEFAULT_TITLE = 'New Chat'

/** List all chat sessions for the authenticated user */
exports.listSessions = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const sessions = await ChatSessionModel.find({ userId })
    .sort({ updatedAt: -1 })
    .lean()
  const list = sessions.map((s) => ({
    id: s._id.toString(),
    title: s.title,
    createdAt: s.createdAt ? new Date(s.createdAt).getTime() : Date.now()
  }))
  return sendJsonResult(res, true, list, null, 200)
})

/** Create a new chat session */
exports.createSession = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const session = new ChatSessionModel({ userId, title: DEFAULT_TITLE })
  await session.save()
  return sendJsonResult(res, true, {
    id: session._id.toString(),
    title: session.title,
    createdAt: session.createdAt ? new Date(session.createdAt).getTime() : Date.now()
  }, 'Chat created', 201)
})

/** Get one session and its messages (ownership checked) */
exports.getSession = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { sessionId } = req.params
  const session = await ChatSessionModel.findOne({ _id: sessionId, userId }).lean()
  if (!session) {
    return sendJsonResult(res, false, null, 'Session not found', 404)
  }
  const messages = await ChatMessageModel.find({ sessionId }).sort({ createdAt: 1 }).lean()
  const sessionPayload = {
    id: session._id.toString(),
    title: session.title,
    createdAt: session.createdAt ? new Date(session.createdAt).getTime() : null
  }
  const messagesPayload = messages.map((m) => ({
    id: m._id.toString(),
    role: m.role,
    content: m.content
  }))
  return sendJsonResult(res, true, { session: sessionPayload, messages: messagesPayload }, null, 200)
})

/** Rename a session */
exports.renameSession = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { sessionId } = req.params
  const { title } = req.body
  const trimmed = typeof title === 'string' ? title.trim() : ''
  if (!trimmed) {
    return sendJsonResult(res, false, null, 'Title is required', 400)
  }
  const session = await ChatSessionModel.findOneAndUpdate(
    { _id: sessionId, userId },
    { $set: { title: trimmed } },
    { new: true }
  ).lean()
  if (!session) {
    return sendJsonResult(res, false, null, 'Session not found', 404)
  }
  return sendJsonResult(res, true, {
    id: session._id.toString(),
    title: session.title,
    createdAt: session.createdAt ? new Date(session.createdAt).getTime() : null
  }, null, 200)
})

/** Delete a session and all its messages */
exports.deleteSession = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { sessionId } = req.params
  const session = await ChatSessionModel.findOneAndDelete({ _id: sessionId, userId })
  if (!session) {
    return sendJsonResult(res, false, null, 'Session not found', 404)
  }
  await ChatMessageModel.deleteMany({ sessionId })
  return sendJsonResult(res, true, null, 'Session deleted', 200)
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
