require('dotenv').config()
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { JobDescriptionModel, ResumeModel, ProfileModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')
const { getEmbedding } = require('../utils/embedding')
const { normalizeSkills } = require('../utils/skillNormalizer')
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

  const systemPrompt = `You are a job description parser. Extract structured data as JSON with keys: title, company (optional), skills (array of strings), requirements (array of strings), responsibilities (array of strings). Reply ONLY with valid JSON.`
  const userPrompt = `Parse this job description:\n\n${text}`

  let parsed = null
  try {
    const functions = [{
      name: 'parse_jd',
      description: 'Return structured job description data.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          company: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } },
          requirements: { type: 'array', items: { type: 'string' } },
          responsibilities: { type: 'array', items: { type: 'string' } }
        },
        required: ['title'],
        additionalProperties: true
      }
    }]

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0,
        max_tokens: 2000,
        functions,
        function_call: { name: 'parse_jd' }
      })
    })

    const body = await resp.json()
    const msg = body?.choices?.[0]?.message
    const funcArgs = msg?.function_call?.arguments
    if (funcArgs) {
      parsed = JSON.parse(funcArgs)
    } else if (msg?.content) {
      try {
        parsed = JSON.parse(msg.content)
      } catch {
        const m = String(msg.content).match(/\{[\s\S]*\}$/)
        if (m) parsed = JSON.parse(m[0])
      }
    }
  } catch (e) {
    return sendJsonResult(res, false, null, 'LLM parse failed', 502)
  }

  if (!parsed) {
    return sendJsonResult(res, false, null, 'Failed to parse JD', 502)
  }

  parsed.title = parsed.title || 'Job'
  parsed.skills = Array.isArray(parsed.skills) ? parsed.skills : []
  parsed.requirements = Array.isArray(parsed.requirements) ? parsed.requirements : []
  parsed.responsibilities = Array.isArray(parsed.responsibilities) ? parsed.responsibilities : []

  return sendJsonResult(res, true, { parsed }, null, 200)
})

/** Store parsed JD with skill normalization and JD embedding */
exports.storeJD = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { parsed, sessionId } = req.body || {}
  if (!parsed || typeof parsed !== 'object') {
    return sendJsonResult(res, false, null, 'Parsed JD is required', 400)
  }

  const skills = normalizeSkills(parsed.skills || [])
  const requirements = Array.isArray(parsed.requirements) ? parsed.requirements : []
  const responsibilities = Array.isArray(parsed.responsibilities) ? parsed.responsibilities : []

  const jd = new JobDescriptionModel({
    userId,
    title: parsed.title || 'Job',
    company: parsed.company || '',
    skills,
    requirements,
    responsibilities,
    rawText: parsed.rawText || ''
  })

  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    const textForEmbedding = [
      parsed.title || '',
      parsed.company || '',
      skills.join(' '),
      requirements.join(' '),
      responsibilities.join(' ')
    ].filter(Boolean).join('\n')
    try {
      const embedding = await getEmbedding(textForEmbedding, openaiKey)
      if (embedding) jd.embedding = embedding
    } catch (e) {
      // continue without embedding
    }
  }

  await jd.save()

  return sendJsonResult(res, true, { jdId: jd._id.toString() }, null, 201)
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

  // 1) Parse JD (same logic as parseJD)
  const systemPrompt = `You are a job description parser. Extract structured data as JSON with keys: title, company (optional), skills (array of strings), requirements (array of strings), responsibilities (array of strings). Reply ONLY with valid JSON.`
  const userPrompt = `Parse this job description:\n\n${text}`

  let parsed = null
  try {
    const functions = [{
      name: 'parse_jd',
      description: 'Return structured job description data.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          company: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } },
          requirements: { type: 'array', items: { type: 'string' } },
          responsibilities: { type: 'array', items: { type: 'string' } }
        },
        required: ['title'],
        additionalProperties: true
      }
    }]

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0,
        max_tokens: 2000,
        functions,
        function_call: { name: 'parse_jd' }
      })
    })

    const body = await resp.json()
    const msg = body?.choices?.[0]?.message
    const funcArgs = msg?.function_call?.arguments
    if (funcArgs) {
      parsed = JSON.parse(funcArgs)
    } else if (msg?.content) {
      try {
        parsed = JSON.parse(msg.content)
      } catch {
        const m = String(msg.content).match(/\{[\s\S]*\}$/)
        if (m) parsed = JSON.parse(m[0])
      }
    }
  } catch (e) {
    return sendJsonResult(res, false, null, 'LLM parse failed', 502)
  }

  if (!parsed) {
    return sendJsonResult(res, false, null, 'Failed to parse JD', 502)
  }

  parsed.title = parsed.title || 'Job'
  parsed.skills = Array.isArray(parsed.skills) ? parsed.skills : []
  parsed.requirements = Array.isArray(parsed.requirements) ? parsed.requirements : []
  parsed.responsibilities = Array.isArray(parsed.responsibilities) ? parsed.responsibilities : []
  parsed.rawText = parsed.rawText || text

  // 2) Store JD with embedding (same as storeJD)
  const skills = normalizeSkills(parsed.skills || [])
  const requirements = Array.isArray(parsed.requirements) ? parsed.requirements : []
  const responsibilities = Array.isArray(parsed.responsibilities) ? parsed.responsibilities : []

  const jd = new JobDescriptionModel({
    userId,
    title: parsed.title || 'Job',
    company: parsed.company || '',
    skills,
    requirements,
    responsibilities,
    rawText: parsed.rawText || ''
  })

  try {
    const textForEmbedding = [
      parsed.title || '',
      parsed.company || '',
      skills.join(' '),
      requirements.join(' '),
      responsibilities.join(' ')
    ].filter(Boolean).join('\n')
    if (textForEmbedding) {
      const embedding = await getEmbedding(textForEmbedding, openaiKey)
      if (embedding) jd.embedding = embedding
    }
  } catch (e) {
    // continue without embedding
  }

  await jd.save()
  const jdId = jd._id.toString()

  // 3) Find top resumes for this profile
  const { topResumes, error } = await findTopResumesCore(userId, jdId, profileId)
  if (error) {
    return sendJsonResult(res, false, null, error, 404)
  }

  return sendJsonResult(res, true, {
    jdId,
    parsed: {
      title: parsed.title,
      company: parsed.company,
      skills: parsed.skills,
      requirements: parsed.requirements,
      responsibilities: parsed.responsibilities
    },
    topResumes: topResumes || []
  }, null, 200)
})

/** Sanitize string for storage */
function sanitizeStr (s) {
  if (s == null) return ''
  return String(s).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim().slice(0, 10000)
}

/** Build resume JSON matching Resume model: name, summary, experiences[], skills[] */
function normalizeResumeJson (raw) {
  const name = sanitizeStr(raw?.name) || 'Generated Resume'
  const summary = sanitizeStr(raw?.summary) || ''
  const experiences = Array.isArray(raw?.experiences)
    ? raw.experiences.slice(0, 20).map((e) => ({
        title: sanitizeStr(e?.title ?? e?.roleTitle) || '',
        companyName: sanitizeStr(e?.companyName) || '',
        companyLocation: sanitizeStr(e?.companyLocation) || '',
        summary: sanitizeStr(e?.summary) || '',
        descriptions: Array.isArray(e?.descriptions) ? e.descriptions.map(sanitizeStr).filter(Boolean) : [],
        startDate: sanitizeStr(e?.startDate) || '',
        endDate: sanitizeStr(e?.endDate) || ''
      }))
    : []
  const skills = Array.isArray(raw?.skills)
    ? raw.skills.slice(0, 10).map((s) => ({
        title: sanitizeStr(s?.title) || 'Skills',
        items: Array.isArray(s?.items) ? s.items.map(sanitizeStr).filter(Boolean).slice(0, 50) : []
      }))
    : []
  return { name, summary, experiences, skills, pageFrameConfig: null }
}

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

  const jdContext = `Job Title: ${jd.title}\nCompany: ${jd.company || 'N/A'}\nRequired Skills: ${(jd.skills || []).join(', ')}\nRequirements: ${(jd.requirements || []).slice(0, 5).join('\n')}\nKey Responsibilities: ${(jd.responsibilities || []).slice(0, 5).join('\n')}`
  const profileContext = `Candidate: ${profile.fullName}\nTitle: ${profile.title}\nExperiences: ${(profile.experiences || []).map(e => `${e.roleTitle} at ${e.companyName}: ${(e.keyPoints || []).slice(0, 2).join('; ')}`).join('\n')}`
  const baseContext = baseResume
    ? `\nBase resume to adapt (use same JSON shape): ${JSON.stringify({ summary: baseResume.summary, experiences: baseResume.experiences?.slice(0, 3), skills: baseResume.skills })}`
    : ''

  const systemPrompt = `You are a resume writing expert. Generate a resume as a single JSON object matching this exact shape (no other text):
{
  "name": "string (resume title)",
  "summary": "string (professional summary)",
  "experiences": [
    {
      "title": "string (job title)",
      "companyName": "string",
      "companyLocation": "string (optional)",
      "summary": "string (optional)",
      "descriptions": ["string", "..."],
      "startDate": "string (e.g. 2020)",
      "endDate": "string (e.g. 2023 or Present)"
    }
  ],
  "skills": [
    { "title": "string (e.g. Skills)", "items": ["string", "..."] }
  ]
}
Use strong action verbs and quantify achievements. Tailor content to the job description. Reply with ONLY valid JSON.`

  const userPrompt = `Job Description:\n${jdContext}\n\nCandidate Profile:\n${profileContext}${baseContext}\n\nGenerate the resume as one JSON object (no markdown, no code fence).`

  let resume = null
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
        temperature: 0.2,
        max_tokens: 2000
      })
    })
    const body = await resp.json()
    let raw = body?.choices?.[0]?.message?.content || ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        resume = normalizeResumeJson(JSON.parse(jsonMatch[0]))
      } catch (e) {
        resume = normalizeResumeJson({ name: 'Generated Resume', summary: raw.slice(0, 500), experiences: [], skills: [] })
      }
    }
  } catch (e) {
    return sendJsonResult(res, false, null, 'Generation failed. Please try again.', 502)
  }

  if (!resume) {
    return sendJsonResult(res, false, null, 'Failed to generate resume.', 502)
  }

  return sendJsonResult(res, true, { resume }, null, 200)
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
