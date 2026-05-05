const openaiAdapter = require('./openai.adapter')
const claudeAdapter = require('./claude.adapter')
const geminiAdapter = require('./gemini.adapter')

function getProviderAdapter(providerKey) {
  const normalized = String(providerKey || '').trim().toLowerCase()
  if (normalized === 'claude') return claudeAdapter
  if (normalized === 'gemini') return geminiAdapter
  return openaiAdapter
}

module.exports = {
  getProviderAdapter,
}
