require('dotenv').config()
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { JobDescriptionModel, ResumeModel, ProfileModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')
const { normalizeParsedJD, parseJobDescriptionWithLLM, createJobDescriptionRecordWithEmbedding } = require('../utils/jdParsing')
const { generateResumeJsonFromJD } = require('../utils/resumeGeneration')
const { findTopResumesCore } = require('../services/findTopResumes')
const fetch = global.fetch

/** Parse job description text using LLM */
exports.parseJD = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { text } = req.body || {}
  if (!text || typeof text !== 'string' || !text.trim()) {
    return sendJsonResult(res, false, null, 'Text is required', 400)
  }
  if (text.length > 100 * 1024) {
    return sendJsonResult(res, false, null, 'Input too large', 413)
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return sendJsonResult(res, false, null, 'LLM not configured', 500)
  }

  try {
    const parsed = await parseJobDescriptionWithLLM(text, openaiKey)
    if (!parsed) {
      return sendJsonResult(res, false, null, 'Failed to parse JD', 502)
    }
    const normalized = normalizeParsedJD(parsed, text)
    return sendJsonResult(res, true, { parsed: normalized }, null, 200)
  } catch (e) {
    return sendJsonResult(res, false, null, 'LLM parse failed', 502)
  }
})

/** Store parsed JD with skill normalization and JD embedding */
exports.storeJD = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { parsed, sessionId } = req.body || {}
  if (!parsed || typeof parsed !== 'object') {
    return sendJsonResult(res, false, null, 'Parsed JD is required', 400)
  }

  const openaiKey = process.env.OPENAI_API_KEY
  const normalized = normalizeParsedJD(parsed, parsed.rawText || '')
  const { jdId } = await createJobDescriptionRecordWithEmbedding({
    userId,
    parsed: normalized,
    rawText: normalized.rawText || '',
    openaiKey,
  })

  return sendJsonResult(res, true, { jdId }, null, 201)
})

/** Find top resumes: weighted ATS + embedding; deep ranker when top scores tied */
exports.findTopResumes = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { jdId, profileId } = req.body || {}
  if (!jdId) {
    return sendJsonResult(res, false, null, 'jdId is required', 400)
  }
  const { topResumes, error } = await findTopResumesCore(userId, jdId, profileId)
  if (error) {
    return sendJsonResult(res, false, null, error, 404)
  }
  return sendJsonResult(res, true, { topResumes }, null, 200)
})

/**
 * Import JD (parse + store with embedding) and find top matching resumes in one call.
 * Body: { profileId, text }. Returns { jdId, parsed, topResumes }.
 */
exports.importJdAndMatch = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { profileId, text } = req.body || {}
  if (!text || typeof text !== 'string' || !text.trim()) {
    return sendJsonResult(res, false, null, 'Text is required', 400)
  }
  if (!profileId) {
    return sendJsonResult(res, false, null, 'profileId is required', 400)
  }
  if (text.length > 100 * 1024) {
    return sendJsonResult(res, false, null, 'Input too large', 413)
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return sendJsonResult(res, false, null, 'LLM not configured', 500)
  }

  try {
    const parsed = await parseJobDescriptionWithLLM(text, openaiKey)
    if (!parsed) {
      return sendJsonResult(res, false, null, 'Failed to parse JD', 502)
    }
    const normalized = normalizeParsedJD(parsed, text)

    const { jdId } = await createJobDescriptionRecordWithEmbedding({
      userId,
      parsed: normalized,
      rawText: text,
      openaiKey,
    })

    // 3) Find top resumes for this profile
    const { topResumes, error } = await findTopResumesCore(userId, jdId, profileId)
    if (error) {
      return sendJsonResult(res, false, null, error, 404)
    }

    return sendJsonResult(res, true, {
      jdId,
      parsed: {
        title: normalized.title,
        company: normalized.company,
        skills: normalized.skills,
        requirements: normalized.requirements,
        responsibilities: normalized.responsibilities,
      },
      topResumes: topResumes || [],
    }, null, 200)
  } catch (e) {
    return sendJsonResult(res, false, null, 'LLM parse failed', 502)
  }
})

/** Generate resume from JD + profile; LLM returns JSON matching Resume model */
exports.generateResumeFromJD = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { jdId, profileId, baseResumeId } = req.body || {}
  if (!jdId || !profileId) {
    return sendJsonResult(res, false, null, 'jdId and profileId are required', 400)
  }

  const jd = await JobDescriptionModel.findOne({ _id: jdId, userId }).lean()
  const profile = await ProfileModel.findOne({ _id: profileId, userId }).lean()
  if (!jd || !profile) {
    return sendJsonResult(res, false, null, 'JD or profile not found', 404)
  }

  let baseResume = null
  if (baseResumeId) {
    baseResume = await ResumeModel.findOne({ _id: baseResumeId, userId }).populate('profileId').lean()
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return sendJsonResult(res, false, null, 'LLM not configured', 500)
  }

  try {
    const resume = await generateResumeJsonFromJD({ jd, profile, baseResume, openaiKey })
    return sendJsonResult(res, true, { resume }, null, 200)
  } catch (e) {
    return sendJsonResult(res, false, null, 'Generation failed. Please try again.', 502)
  }
})

/** Refine resume with user feedback (delta editor: apply only requested changes) */
exports.refineResume = asyncErrorHandler(async (req, res) => {
  const { resumeContent, feedback } = req.body || {}
  if (!resumeContent || !feedback || typeof feedback !== 'string') {
    return sendJsonResult(res, false, null, 'resumeContent and feedback are required', 400)
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return sendJsonResult(res, false, null, 'LLM not configured', 500)
  }

  const systemPrompt = `You are a delta resume editor. Apply ONLY the user's requested changes to the resume. Do not rewrite unrelated sections. Preserve formatting and structure elsewhere. Output the full resume with only the requested edits applied, as plain text.`
  const userPrompt = `Current resume:\n\n${resumeContent}\n\nUser feedback (apply only this): ${feedback}\n\nOutput the full revised resume below.`

  let content = ''
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.0,
        max_tokens: 2000
      })
    })
    const body = await resp.json()
    content = body?.choices?.[0]?.message?.content || resumeContent
  } catch (e) {
    content = resumeContent
  }

  return sendJsonResult(res, true, { content }, null, 200)
})
