const { ResumeModel, JobDescriptionModel, ChatMessageModel } = require('../dbModels')

module.exports = async function atsScorer(job, updateProgress) {
  const { jdId, profileId } = job.payload || {}
  if (!jdId) throw new Error('jdId required')
  const jd = await JobDescriptionModel.findById(jdId).lean()
  if (!jd) throw new Error('JD not found')
  const jdSkills = new Set((jd.skills || []).map(s => String(s).toLowerCase().trim()))
  const jdReqText = (jd.requirements || []).concat(jd.responsibilities || []).join(' ').toLowerCase()
  const jdKeywords = new Set(jdReqText.split(/\W+/).filter(Boolean))

  const query = profileId ? { profileId } : {}
  const resumes = await ResumeModel.find(query).populate('profileId').lean()
  updateProgress(20)
  const scored = resumes.map((r) => {
    const resumeSkills = new Set()
    const resumeText = []
    ;(r.skills || []).forEach(s => { if (s?.items) s.items.forEach(i => resumeSkills.add(String(i).toLowerCase())) })
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
      jdSkills.forEach(s => { if ([...resumeSkills].some(rs => rs.includes(s) || s.includes(rs))) matchCount++ })
      skillMatch = (matchCount / jdSkills.size) * 100
    }
    let keywordMatch = 0
    if (jdKeywords.size > 0) {
      let matchCount = 0
      jdKeywords.forEach(k => { if (k.length > 2 && fullText.includes(k)) matchCount++ })
      keywordMatch = (matchCount / Math.min(jdKeywords.size, 50)) * 100
    }
    const atsScore = Math.min(100, (skillMatch * 0.5 + keywordMatch * 0.5 + 20))
    const confidence = Math.min(1, atsScore / 80)
    return {
      resumeId: r._id.toString(),
      resumeName: String(r.name || 'Untitled'),
      profileName: r.profileId?.fullName || r.profileId?.title,
      atsScore,
      confidence,
      breakdown: { skillMatch, keywordMatch, experienceRelevance: keywordMatch }
    }
  })
  scored.sort((a,b) => b.atsScore - a.atsScore)
  const topResumes = scored.slice(0,3)
  updateProgress(100, { topResumes })
  // create assistant message summarizing top resumes
  if (job.payload && job.payload.sessionId) {
    const lines = topResumes.map((r, i) => `${i+1}. ${r.resumeName} (Score: ${Math.round(r.atsScore)}%)`).join('\\n')
    const assistantContent = `Top matching resumes:\\n${lines}`
    try {
      await ChatMessageModel.create({
        sessionId: job.payload.sessionId,
        role: 'assistant',
        content: assistantContent,
        structuredAssistantPayload: { type: 'top_resumes', topResumes }
      })
    } catch (e) {}
  }
  return { topResumes }
}

