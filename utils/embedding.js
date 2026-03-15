/**
 * OpenAI embedding helpers for JD and resume similarity.
 * Uses text-embedding-3-small (1536 dimensions).
 */
const fetch = global.fetch || require('node-fetch');

const EMBEDDING_MODEL = 'text-embedding-3-small';

async function getEmbedding(text, openaiKey) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null;
  }
  const truncated = text.trim().slice(0, 8000);
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncated,
    }),
  });
  const body = await resp.json();
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
