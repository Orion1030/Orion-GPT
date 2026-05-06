/**
 * Shared logic for finding top resumes by JD: weighted ATS + embedding, deep ranker when tied.
 * Used by resume.controller (HTTP) and atsScorer agent (job).
 */
const { JobDescriptionModel, ResumeModel } = require('../dbModels')
const { cosineSimilarity, similarityToScore } = require('../utils/embedding')
const { buildResumeTextForEmbedding, refreshResumeEmbedding } = require('./resumeEmbedding.service')

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

async function refreshEmbeddingWithRetry(resumeId, maxAttempts = 3) {
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
    try {
      await refreshResumeEmbedding(resumeId)
      return true
    } catch (e) {
      const isLast = attempt >= maxAttempts
      console.warn(
        `[findTopResumesCore] embedding refresh failed for ${String(resumeId)} attempt ${attempt}/${maxAttempts}:`,
        e?.message || e
      )
      if (!isLast) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
      }
    }
  }
  return false
}

async function findTopResumesCore(userId, jdId, profileId) {
  const jd = await JobDescriptionModel.findOne({ _id: jdId, userId }).lean()
  if (!jd) return { topResumes: [], error: 'Job description not found' }

  const jdSkills = new Set((jd.skills || []).map(s => String(s).toLowerCase().trim()))
  const jdReqText = (jd.requirements || []).concat(jd.responsibilities || []).join(' ').toLowerCase()
  const jdKeywords = new Set(jdReqText.split(/\W+/).filter(Boolean))
  const jdEmbedding = jd.embedding && Array.isArray(jd.embedding) ? jd.embedding : null

  const query = { userId, isDeleted: { $ne: true } }
  if (profileId) query.profileId = profileId

  const resumes = await ResumeModel.find(query).populate('profileId').sort({ updatedAt: -1 }).lean()
  const skippedResumeIds = new Set()

  // ATS scoring requires resume embeddings. If a resume is missing one, generate it now (sync, 3 tries)
  // and skip that resume from this scoring pass. It will participate in subsequent runs.
  if (jdEmbedding) {
    const missingEmbeddingResumes = resumes.filter(
      (r) => !(r.embedding && Array.isArray(r.embedding) && r.embedding.length)
    )
    for (const r of missingEmbeddingResumes) {
      const textForEmbedding = buildResumeTextForEmbedding(r)
      if (!textForEmbedding) {
        skippedResumeIds.add(String(r._id))
        continue
      }
      await refreshEmbeddingWithRetry(r._id, 3)
      skippedResumeIds.add(String(r._id))
    }
  }

  const resumesForScoring = jdEmbedding
    ? resumes.filter((r) => {
      const id = String(r._id)
      return !skippedResumeIds.has(id) && r.embedding && Array.isArray(r.embedding) && r.embedding.length
    })
    : resumes

  const scored = await Promise.all(resumesForScoring.map(async (r) => {
    const resumeSkills = new Set()
    ;(r.skills || []).forEach(s => {
      if (s?.items) s.items.forEach(i => resumeSkills.add(String(i).toLowerCase()))
    })
    const resumeText = []
    ;(r.experiences || []).forEach(e => {
      const legacySummary = String(e?.summary || '').trim()
      const bullets = Array.isArray(e?.bullets)
        ? e.bullets
        : Array.isArray(e?.descriptions)
          ? e.descriptions
          : []
      const mergedBullets = [...new Set([legacySummary, ...bullets].filter(Boolean))]
      resumeText.push(e.title || '')
      mergedBullets.forEach((d) => resumeText.push(d))
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
    const resumeEmbedding = r.embedding && Array.isArray(r.embedding) ? r.embedding : null

    if (jdEmbedding) {
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
