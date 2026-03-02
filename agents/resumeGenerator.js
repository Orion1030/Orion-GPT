const fetch = global.fetch || require('node-fetch')
const { JobDescriptionModel, ProfileModel, ResumeModel, ChatMessageModel } = require('../dbModels')

// Minimal server-side sanitizer for generated HTML/text to avoid storing scripts or event handlers.
function sanitizeGeneratedContent(html) {
  if (!html || typeof html !== 'string') return '';
  // remove script/style tags and their content
  let out = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  // remove on* attributes (onclick, onerror, etc.)
  out = out.replace(/\son\w+\s*=\s*(['"`])[\s\S]*?\1/gi, '');
  // remove javascript: URIs
  out = out.replace(/href\s*=\s*(['"`])\s*javascript:[\s\S]*?\1/gi, 'href="#"');
  // strip potentially dangerous tags but keep common formatting
  const allowedTags = ['b','i','strong','em','p','ul','ol','li','br','h1','h2','h3','h4','h5','h6','div','span','a'];
  out = out.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (m, tag, rest) => {
    tag = String(tag || '').toLowerCase();
    if (allowedTags.includes(tag)) {
      // remove any remaining attributes except href on <a>
      if (tag === 'a') {
        const hrefMatch = rest && rest.match(/href\s*=\s*(['"`])([^'"`]+)\1/i);
        const href = hrefMatch ? hrefMatch[2] : '#';
        return `<a href="${href}">`;
      }
      return `<${tag}>`;
    }
    return '';
  });
  return out;
}

async function generateWithOpenAI(prompt) {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) throw new Error('LLM not configured')
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: 'You are a resume writing expert.' }, { role: 'user', content: prompt }],
      temperature: 0.0,
      max_tokens: 2000
    })
  })
  const body = await resp.json()
  return body?.choices?.[0]?.message?.content || ''
}

module.exports = async function resumeGenerator(job, updateProgress) {
  const { jdId, profileId, baseResumeId } = job.payload || {}
  if (!jdId || !profileId) throw new Error('jdId and profileId are required')
  const jd = await JobDescriptionModel.findById(jdId).lean()
  const profile = await ProfileModel.findById(profileId).lean()
  if (!jd || !profile) throw new Error('JD or profile not found')
  updateProgress(10)
  const jdContext = `Job Title: ${jd.title}\nCompany: ${jd.company || 'N/A'}\nRequired Skills: ${(jd.skills || []).join(', ')}\nRequirements: ${(jd.requirements || []).slice(0,5).join('\\n')}`
  const profileContext = `Candidate: ${profile.fullName}\nTitle: ${profile.title}\nExperiences: ${(profile.experiences || []).map(e => `${e.roleTitle} at ${e.companyName}: ${(e.keyPoints || []).slice(0,2).join('; ')}`).join('\\n')}`
  const baseContext = baseResumeId ? `Base resume to adapt: ${baseResumeId}` : ''
  const prompt = `Job Description:\\n${jdContext}\\n\\nCandidate Profile:\\n${profileContext}${baseContext}\\n\\nGenerate a tailored resume for this candidate.`
  updateProgress(30)
  const content = await generateWithOpenAI(prompt)
  updateProgress(90, { content })
  // create assistant message with structured payload if sessionId provided
  if (job.payload && job.payload.sessionId) {
    try {
      const safe = sanitizeGeneratedContent(content)
      await ChatMessageModel.create({
        sessionId: job.payload.sessionId,
        role: 'assistant',
        content: safe,
        structuredAssistantPayload: { type: 'generated_resume', content: safe }
      })
    } catch (e) {
      // ignore write errors
    }
  }
  // Return content; saving to Resume is handled by higher-level flow if needed
  return { content }
}

