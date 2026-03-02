require('dotenv').config()
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { JobDescriptionModel, ResumeModel, ProfileModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')
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

/** Store parsed JD and optionally generate embedding */
exports.storeJD = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { parsed, sessionId } = req.body || {}
  if (!parsed || typeof parsed !== 'object') {
    return sendJsonResult(res, false, null, 'Parsed JD is required', 400)
  }

  const jd = new JobDescriptionModel({
    userId,
    title: parsed.title || 'Job',
    company: parsed.company || '',
    skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
    responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
    rawText: parsed.rawText || ''
  })
  await jd.save()

  return sendJsonResult(res, true, { jdId: jd._id.toString() }, null, 201)
})

/** Find top resumes matching JD (weighted ATS-style scoring) */
exports.findTopResumes = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id
  const { jdId, profileId } = req.body || {}
  if (!jdId) {
    return sendJsonResult(res, false, null, 'jdId is required', 400)
  }

  const jd = await JobDescriptionModel.findOne({ _id: jdId, userId }).lean()
  if (!jd) {
    return sendJsonResult(res, false, null, 'Job description not found', 404)
  }

  const jdSkills = new Set((jd.skills || []).map(s => String(s).toLowerCase().trim()))
  const jdReqText = (jd.requirements || []).concat(jd.responsibilities || []).join(' ').toLowerCase()
  const jdKeywords = new Set(jdReqText.split(/\W+/).filter(Boolean))

  let query = { userId }
  if (profileId) {
    query.profileId = profileId
  }

  const resumes = await ResumeModel.find(query)
    .populate('profileId')
    .sort({ updatedAt: -1 })
    .lean()

  const scored = resumes.map((r) => {
    const resumeSkills = new Set()
    const resumeText = []
    ;(r.skills || []).forEach(s => {
      if (s?.items) s.items.forEach(i => resumeSkills.add(String(i).toLowerCase()))
    })
    ;(r.experiences || []).forEach(e => {
      resumeText.push(e.summary || e.title || '')
      ;(e.descriptions || []).forEach(d => resumeText.push(d))
    })
    resumeText.push(r.summary || '')
    const fullText = resumeText.join(' ').toLowerCase()
    const resumeKeywords = new Set(fullText.split(/\W+/).filter(Boolean))

    let skillMatch = 0
    if (jdSkills.size > 0) {
      let matchCount = 0
      jdSkills.forEach(s => {
        if ([...resumeSkills].some(rs => rs.includes(s) || s.includes(rs))) matchCount++
      })
      skillMatch = (matchCount / jdSkills.size) * 100
    }

    let keywordMatch = 0
    if (jdKeywords.size > 0) {
      let matchCount = 0
      jdKeywords.forEach(k => {
        if (k.length > 2 && fullText.includes(k)) matchCount++
      })
      keywordMatch = (matchCount / Math.min(jdKeywords.size, 50)) * 100
    }

    const atsScore = Math.min(100, (skillMatch * 0.5 + keywordMatch * 0.5 + 20))
    const confidence = Math.min(1, atsScore / 80)

    return {
      resumeId: r._id.toString(),
      resumeName: r.name || 'Untitled',
      profileName: r.profileId?.fullName || r.profileId?.title,
      atsScore,
      confidence,
      breakdown: {
        skillMatch,
        keywordMatch,
        experienceRelevance: keywordMatch
      }
    }
  })

  scored.sort((a, b) => b.atsScore - a.atsScore)
  const topResumes = scored.slice(0, 3)

  return sendJsonResult(res, true, { topResumes }, null, 200)
})

/** Generate resume from JD + profile (optionally based on existing resume) */
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

  const jdContext = `
Job Title: ${jd.title}
Company: ${jd.company || 'N/A'}
Required Skills: ${(jd.skills || []).join(', ')}
Requirements: ${(jd.requirements || []).slice(0, 5).join('\n')}
Key Responsibilities: ${(jd.responsibilities || []).slice(0, 5).join('\n')}
`

  const profileContext = `
Candidate: ${profile.fullName}
Title: ${profile.title}
Experiences: ${(profile.experiences || []).map(e => `${e.roleTitle} at ${e.companyName}: ${(e.keyPoints || []).slice(0, 2).join('; ')}`).join('\n')}
`

  const baseContext = baseResume
    ? `\nBase resume to adapt: ${JSON.stringify({ summary: baseResume.summary, experiences: baseResume.experiences?.slice(0, 2), skills: baseResume.skills })}\n`
    : ''

  const systemPrompt = `You are a resume writing expert. Create a resume tailored to the job description. Use strong action verbs and quantify achievements where possible. Output format: plain text resume sections (Summary, Experience, Education, Skills).`
  const userPrompt = `Job Description:\n${jdContext}\n\nCandidate Profile:\n${profileContext}${baseContext}\n\nGenerate a tailored resume for this candidate.`

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
    content = body?.choices?.[0]?.message?.content || 'Failed to generate resume.'
  } catch (e) {
    content = 'Generation failed. Please try again.'
  }

  return sendJsonResult(res, true, { content }, null, 200)
})

/** Refine resume with user feedback */
exports.refineResume = asyncErrorHandler(async (req, res) => {
  const { resumeContent, feedback } = req.body || {}
  if (!resumeContent || !feedback || typeof feedback !== 'string') {
    return sendJsonResult(res, false, null, 'resumeContent and feedback are required', 400)
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return sendJsonResult(res, false, null, 'LLM not configured', 500)
  }

  const systemPrompt = `You are a resume editor. Apply the user's feedback to improve the resume. Keep the same structure. Output the refined resume as plain text.`
  const userPrompt = `Current resume:\n\n${resumeContent}\n\nUser feedback: ${feedback}\n\nProvide the improved resume below.`

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
