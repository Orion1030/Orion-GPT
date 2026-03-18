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
    parts.push(e.title || '', e.summary || '', (e.descriptions || []).join(' '));
  });
  (r.skills || []).forEach((s) => {
    if (s?.items) parts.push(s.items.join(' '));
  });
  return parts.filter(Boolean).join('\n').trim();
}

/**
 * @param {import('mongoose').Types.ObjectId|string} resumeId
 * @returns {Promise<number[]|null>} embedding vector or null
 */
async function refreshResumeEmbedding(resumeId) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey || !resumeId) return null;
  try {
    const r = await ResumeModel.findById(resumeId).lean();
    if (!r) return null;
    const text = buildResumeTextForEmbedding(r);
    if (!text) {
      await ResumeModel.updateOne({ _id: resumeId }, { $set: { embedding: null } });
      return null;
    }
    const vec = await getEmbedding(text, openaiKey);
    if (vec && Array.isArray(vec)) {
      await ResumeModel.updateOne({ _id: resumeId }, { $set: { embedding: vec } });
      return vec;
    }
  } catch (e) {
    console.warn('[refreshResumeEmbedding]', String(resumeId), e?.message || e);
  }
  return null;
}

module.exports = {
  buildResumeTextForEmbedding,
  refreshResumeEmbedding,
};
