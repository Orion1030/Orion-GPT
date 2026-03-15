/**
 * Shared logic for finding top resumes by JD: weighted ATS + embedding, deep ranker when tied.
 * Used by jd.controller (HTTP) and atsScorer agent (job).
 */
const { JobDescriptionModel, ResumeModel } = require('../dbModels')
const { getEmbedding, cosineSimilarity, similarityToScore } = require('../utils/embedding')

function buildResumeTextForEmbedding(r) {
  const parts = [r.summary || '']
  ;(r.experiences || []).forEach((e) => {
    parts.push(e.title || '', e.summary || '', (e.descriptions || []).join(' '))
  })
  ;(r.skills || []).forEach((s) => {
    if (s?.items) parts.push(s.items.join(' '))
  })
  return parts.filter(Boolean).join('\n').trim()
}

function quantifiedImpactScore(r) {
  const text = buildResumeTextForEmbedding(r)
  const matches = text.match(/\d+[%x×]?|\d+\.\d+|\$\d+/gi)
  return Math.min(100, (matches ? matches.length : 0) * 5)
}

function recencyScore(r) {
  const exps = r.experiences || []
  if (exps.length === 0) return 50
  let best = 0
  exps.forEach((e) => {
    const end = e.endDate || e.startDate || ''
    const year = parseInt(end.slice(0, 4), 10)
    if (!isNaN(year)) best = Math.max(best, year)
  })
  if (best === 0) return 50
  const currentYear = new Date().getFullYear()
  const yearsAgo = currentYear - best
  return Math.max(0, Math.min(100, 100 - yearsAgo * 10))
}

async function findTopResumesCore(userId, jdId, profileId) {
  const jd = await JobDescriptionModel.findOne({ _id: jdId, userId }).lean()
  if (!jd) return { topResumes: [], error: 'Job description not found' }

  const jdSkills = new Set((jd.skills || []).map(s => String(s).toLowerCase().trim()))
  const jdReqText = (jd.requirements || []).concat(jd.responsibilities || []).join(' ').toLowerCase()
  const jdKeywords = new Set(jdReqText.split(/\W+/).filter(Boolean))
  const jdEmbedding = jd.embedding && Array.isArray(jd.embedding) ? jd.embedding : null

  const query = { userId }
  if (profileId) query.profileId = profileId

  const resumes = await ResumeModel.find(query).populate('profileId').sort({ updatedAt: -1 }).lean()
  const openaiKey = process.env.OPENAI_API_KEY

  const scored = await Promise.all(resumes.map(async (r) => {
    const resumeSkills = new Set()
    ;(r.skills || []).forEach(s => {
      if (s?.items) s.items.forEach(i => resumeSkills.add(String(i).toLowerCase()))
    })
    const resumeText = []
    ;(r.experiences || []).forEach(e => {
      resumeText.push(e.summary || e.title || '')
      ;(e.descriptions || []).forEach(d => resumeText.push(d))
    })
    resumeText.push(r.summary || '')
    const fullText = resumeText.join(' ').toLowerCase()

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

    const atsBase = Math.min(100, skillMatch * 0.5 + keywordMatch * 0.5 + 20)
    let embeddingSimScore = 0
    let resumeEmbedding = r.embedding && Array.isArray(r.embedding) ? r.embedding : null

    if (openaiKey && jdEmbedding) {
      if (!resumeEmbedding) {
        const textForEmbedding = buildResumeTextForEmbedding(r)
        if (textForEmbedding) {
          try {
            resumeEmbedding = await getEmbedding(textForEmbedding, openaiKey)
            if (resumeEmbedding) {
              await ResumeModel.updateOne({ _id: r._id }, { $set: { embedding: resumeEmbedding } })
            }
          } catch (e) {}
        }
      }
      if (resumeEmbedding) {
        const sim = cosineSimilarity(jdEmbedding, resumeEmbedding)
        embeddingSimScore = similarityToScore(sim)
      }
    }

    const atsScore = embeddingSimScore > 0 ? Math.min(100, atsBase * 0.5 + embeddingSimScore * 0.5) : atsBase
    const confidence = Math.min(1, atsScore / 80)

    return {
      resumeId: r._id.toString(),
      resumeName: r.name || 'Untitled',
      profileName: r.profileId?.fullName || r.profileId?.title,
      atsScore,
      confidence,
      _raw: r,
      _embeddingSim: embeddingSimScore,
      breakdown: { skillMatch, keywordMatch, experienceRelevance: keywordMatch }
    }
  }))

  scored.sort((a, b) => b.atsScore - a.atsScore)
  let topCandidates = scored.slice(0, 5)
  const topScores = topCandidates.slice(0, 3).map((x) => Math.round(x.atsScore))
  const allEqual = topScores.length >= 2 && topScores.every((s) => s === topScores[0])

  if (allEqual && jdEmbedding && topCandidates.length > 0) {
    topCandidates = topCandidates.map((c) => {
      const impact = quantifiedImpactScore(c._raw)
      const recency = recencyScore(c._raw)
      const deepScore = (c._embeddingSim || 0) * 0.4 + impact * 0.3 + recency * 0.3
      return { ...c, _deepScore: deepScore }
    })
    topCandidates.sort((a, b) => (b._deepScore || 0) - (a._deepScore || 0))
  }

  const topResumes = topCandidates.slice(0, 3).map(({ _raw, _embeddingSim, _deepScore, ...rest }) => rest)
  return { topResumes }
}

module.exports = { findTopResumesCore }
