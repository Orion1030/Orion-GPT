/**
 * Resume text → OpenAI embedding → stored on Resume.embedding for JD matching / ATS scoring.
 * Used after create, update, and AI-generated saves so findTopResumes can use cosine similarity
 * without paying for embedding API on every match request.
 */
const { getEmbedding } = require('../utils/embedding');
const { ResumeModel } = require('../dbModels');

function buildResumeTextForEmbedding(r) {
  if (!r) return '';
  const parts = [r.summary || ''];
  (r.experiences || []).forEach((e) => {
    const legacySummary = String(e?.summary || '').trim();
    const bullets = Array.isArray(e?.bullets)
      ? e.bullets
      : Array.isArray(e?.descriptions)
        ? e.descriptions
        : [];
    const mergedBullets = [...new Set([legacySummary, ...bullets].filter(Boolean))];
    parts.push(e.title || '', mergedBullets.join(' '));
  });
  (r.skills || []).forEach((s) => {
    if (s?.items) parts.push(s.items.join(' '));
  });
  (r.education || []).forEach((e) => {
    parts.push(e.degreeLevel || '', e.major || '', e.universityName || '', e.startDate || '', e.endDate || '');
  });
  return parts.filter(Boolean).join('\n').trim();
}

/**
 * @param {import('mongoose').Types.ObjectId|string} resumeId
 * @returns {Promise<number[]|null>} embedding vector or null
 */
async function refreshResumeEmbedding(resumeId) {
  if (!resumeId) return null;
  const r = await ResumeModel.findOne({ _id: resumeId, isDeleted: { $ne: true } }).lean();
  if (!r) return null;
  const text = buildResumeTextForEmbedding(r);
  if (!text) {
    await ResumeModel.updateOne({ _id: resumeId }, { $set: { embedding: null } });
    return null;
  }
  const vec = await getEmbedding(text);
  if (vec && Array.isArray(vec)) {
    await ResumeModel.updateOne({ _id: resumeId }, { $set: { embedding: vec } });
    return vec;
  }
  throw new Error('Embedding provider returned invalid vector');
}

function queueResumeEmbeddingRefresh(resumeId, opts = {}) {
  const maxAttempts = Number.isInteger(opts.maxAttempts) ? opts.maxAttempts : 3;
  const retryDelayMs = Number.isInteger(opts.retryDelayMs) ? opts.retryDelayMs : 600;

  // Fire-and-forget on purpose so API responses are not blocked by embedding latency.
  Promise.resolve().then(async () => {
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
      try {
        await refreshResumeEmbedding(resumeId);
        return;
      } catch (e) {
        const isLast = attempt >= maxAttempts;
        console.warn(
          `[queueResumeEmbeddingRefresh] ${String(resumeId)} attempt ${attempt}/${maxAttempts} failed:`,
          e?.message || e
        );
        if (isLast) return;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }).catch(() => {});
}

module.exports = {
  buildResumeTextForEmbedding,
  refreshResumeEmbedding,
  queueResumeEmbeddingRefresh,
};
