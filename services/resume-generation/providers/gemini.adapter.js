function buildUnsupportedError() {
  const error = new Error('Gemini reasoning pipeline is not enabled yet')
  error.code = 'reasoning_unsupported'
  return error
}

async function generateStructured() {
  throw buildUnsupportedError()
}

function supportsReasoningModel() {
  return false
}

module.exports = {
  generateStructured,
  providerKey: 'gemini',
  supportsReasoningModel,
}
