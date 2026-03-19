/**
 * OpenAI embedding helpers for JD and resume similarity.
 * Uses text-embedding-3-small (1536 dimensions).
 */
const { createEmbedding } = require('../services/llm/openaiClient');

const EMBEDDING_MODEL = 'text-embedding-3-small';

async function getEmbedding(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null;
  }
  const truncated = text.trim().slice(0, 8000);
  let body = null;
  try {
    body = await createEmbedding({ model: EMBEDDING_MODEL, input: truncated });
  } catch {
    // If LLM is not configured (or provider errors), we degrade gracefully.
    return null;
  }
  const vec = body?.data?.[0]?.embedding;
  return Array.isArray(vec) ? vec : null;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Map similarity from [-1,1] to [0,100] for display */
function similarityToScore(sim) {
  if (sim == null || Number.isNaN(sim)) return 0;
  return Math.max(0, Math.min(100, (sim + 1) * 50));
}

module.exports = {
  getEmbedding,
  cosineSimilarity,
  similarityToScore,
};
