const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const sanitizeHtml = require('sanitize-html')
const { ChatMessageModel, ChatSessionModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')

/** Update structured assistant payload for a message (ownership checked) */
exports.updateStructured = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { messageId } = req.params
  const { structuredAssistantPayload } = req.body || {}
  if (!structuredAssistantPayload || typeof structuredAssistantPayload !== 'object') {
    return sendJsonResult(res, false, null, 'structuredAssistantPayload is required', 400)
  }

  // Basic type-based validation + sanitization
  const allowedTypes = ['job_description', 'top_resumes', 'generated_resume']
  const type = structuredAssistantPayload.type
  if (!allowedTypes.includes(type)) {
    return sendJsonResult(res, false, null, 'Invalid structuredAssistantPayload.type', 400)
  }

  // sanitizer helpers
  const stripTags = (s) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim()
  const sanitizeHtmlAllowList = (html) =>
    sanitizeHtml(String(html || ''), {
      allowedTags: ['b','i','strong','em','p','ul','ol','li','br','h1','h2','h3','a','div','span'],
      allowedAttributes: { a: ['href'] },
      allowedSchemesByTag: { a: ['http','https','mailto'] }
    })

  let sanitizedPayload = null
  try {
    if (type === 'job_description') {
      const parsed = structuredAssistantPayload.parsed || {}
      const parsedSan = {
        title: stripTags(parsed.title || ''),
        company: stripTags(parsed.company || ''),
        skills: Array.isArray(parsed.skills) ? parsed.skills.map(s => stripTags(s)) : [],
        requirements: Array.isArray(parsed.requirements) ? parsed.requirements.map(r => stripTags(r)) : [],
        responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities.map(r => stripTags(r)) : []
      }
      sanitizedPayload = { type, parsed: parsedSan }
    } else if (type === 'top_resumes') {
      const top = Array.isArray(structuredAssistantPayload.topResumes) ? structuredAssistantPayload.topResumes : []
      sanitizedPayload = {
        type,
        topResumes: top.map((t) => ({
          resumeId: String(t.resumeId || ''),
          resumeName: stripTags(t.resumeName || ''),
          atsScore: Number(t.atsScore || 0),
          confidence: Number(t.confidence || 0),
          breakdown: t.breakdown || null
        }))
      }
    } else if (type === 'generated_resume') {
      const content = structuredAssistantPayload.content || ''
      const safe = sanitizeHtmlAllowList(content)
      sanitizedPayload = { type, content: safe }
    }
  } catch (e) {
    return sendJsonResult(res, false, null, 'Invalid structured payload', 400)
  }

  const msg = await ChatMessageModel.findById(messageId).lean()
  if (!msg) return sendJsonResult(res, false, null, 'Message not found', 404)
  const session = await ChatSessionModel.findById(msg.sessionId).lean()
  if (!session || String(session.userId) !== String(userId)) {
    return sendJsonResult(res, false, null, 'Not authorized', 403)
  }

  // Only allow updates to assistant messages
  if (msg.role !== 'assistant') {
    return sendJsonResult(res, false, null, 'Only assistant messages can be updated', 400)
  }

  const updated = await ChatMessageModel.findOneAndUpdate(
    { _id: messageId },
    { $set: { structuredAssistantPayload: sanitizedPayload, content: sanitizedPayload?.text || msg.content } },
    { new: true }
  ).lean()

  return sendJsonResult(res, true, updated, 'Message updated', 200)
})

