const fetch = global.fetch || require('node-fetch')
const sanitizeHtml = require('sanitize-html')
const { JobDescriptionModel, ChatMessageModel } = require('../dbModels')
const { getEmbedding } = require('../utils/embedding')
const { normalizeSkills } = require('../utils/skillNormalizer')

async function parseWithOpenAI(text) {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) throw new Error('LLM provider not configured')
  const systemPrompt = `You are a job description parser. Extract structured data as JSON with keys: title, company (optional), skills (array of strings), requirements (array of strings), responsibilities (array of strings). Reply ONLY with valid JSON.`
  const userPrompt = `Parse this job description:\n\n${text}`
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0,
      max_tokens: 2000
    })
  })
  const body = await resp.json()
  const msg = body?.choices?.[0]?.message
  let parsed = null
  const funcArgs = msg?.function_call?.arguments
  if (funcArgs) parsed = JSON.parse(funcArgs)
  else if (msg?.content) {
    try { parsed = JSON.parse(msg.content) } catch (e) {
      const m = String(msg.content).match(/\{[\s\S]*\}$/)
      if (m) parsed = JSON.parse(m[0])
    }
  }
  return parsed
}

module.exports = async function jdParser(job, updateProgress) {
  const text = job.payload?.text || job.payload?.rawText
  if (!text) throw new Error('No text in job payload')
  updateProgress(10)
  let parsed = null
  try {
    parsed = await parseWithOpenAI(text)
  } catch (e) {
    throw e
  }
  parsed = parsed || {}
  // sanitize parsed fields
  const strip = (s) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim()
  parsed.title = strip(parsed.title || 'Job')
  parsed.company = strip(parsed.company || '')
  const rawSkills = Array.isArray(parsed.skills) ? parsed.skills.map(s => strip(s)) : []
  parsed.skills = normalizeSkills(rawSkills)
  parsed.requirements = Array.isArray(parsed.requirements) ? parsed.requirements.map(r => strip(r)) : []
  parsed.responsibilities = Array.isArray(parsed.responsibilities) ? parsed.responsibilities.map(r => strip(r)) : []
  updateProgress(50)
  // JD embedding for semantic matching
  let embedding = null
  if (process.env.OPENAI_API_KEY) {
    const textForEmbedding = [parsed.title, parsed.company, parsed.skills.join(' '), (parsed.requirements || []).join(' '), (parsed.responsibilities || []).join(' ')].filter(Boolean).join('\n')
    try {
      embedding = await getEmbedding(textForEmbedding, process.env.OPENAI_API_KEY)
    } catch (e) {}
  }
  updateProgress(60)
  const jd = new JobDescriptionModel({
    userId: job.userId,
    title: parsed.title,
    company: parsed.company || '',
    skills: parsed.skills,
    requirements: parsed.requirements,
    responsibilities: parsed.responsibilities,
    rawText: text,
    embedding: embedding || undefined
  })
  await jd.save()
  // create assistant message in session for conversational flow if sessionId provided
  if (job.payload && job.payload.sessionId) {
    const assistantContent = `Parsed Job Description:\\nTitle: ${parsed.title || ''}\\nCompany: ${parsed.company || ''}\\nSkills: ${(parsed.skills || []).join(', ')}\\n\\nRequirements:\\n${(parsed.requirements || []).map(r => '- ' + r).join('\\n')}`
    try {
      await ChatMessageModel.create({
        sessionId: job.payload.sessionId,
        role: 'assistant',
        content: assistantContent,
        structuredAssistantPayload: { type: 'job_description', parsed }
      })
    } catch (e) {
      // ignore message creation errors
    }
  }
  updateProgress(90, { parsed, jdId: jd._id.toString() })
  return { parsed, jdId: jd._id.toString() }
}

