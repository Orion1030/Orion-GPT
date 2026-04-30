const { responsesCreate } = require('../../llm/openaiClient')
const { GENERATE_TIMEOUT_MS } = require('../../../config/llm')

function mapReasoningProfile(profile) {
  if (String(profile || '').trim().toLowerCase() === 'fast') {
    return { effort: 'low' }
  }
  if (String(profile || '').trim().toLowerCase() === 'deep') {
    return { effort: 'high' }
  }
  return { effort: 'medium' }
}

function extractTextFromResponsesOutput(body) {
  if (typeof body?.output_text === 'string' && body.output_text.trim()) {
    return body.output_text
  }

  const output = Array.isArray(body?.output) ? body.output : []
  const parts = []

  for (const item of output) {
    if (typeof item?.content === 'string' && item.content.trim()) {
      parts.push(item.content)
      continue
    }

    const content = Array.isArray(item?.content) ? item.content : []
    for (const chunk of content) {
      if (typeof chunk?.text === 'string' && chunk.text.trim()) {
        parts.push(chunk.text)
        continue
      }
      if (typeof chunk?.content === 'string' && chunk.content.trim()) {
        parts.push(chunk.content)
      }
    }
  }

  return parts.join('\n').trim()
}

function extractStructuredJsonFromResponses(body) {
  const text = extractTextFromResponsesOutput(body)
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace < 0 || lastBrace <= firstBrace) return null
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1))
    } catch {
      return null
    }
  }
}

async function generateStructured({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  schemaName,
  schema,
  maxOutputTokens,
  reasoningProfile,
  continuationState = null,
}) {
  const response = await responsesCreate({
    apiKey,
    model,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_output_tokens: maxOutputTokens,
    timeout_ms: GENERATE_TIMEOUT_MS,
    reasoning: mapReasoningProfile(reasoningProfile),
    text: {
      format: {
        type: 'json_schema',
        name: schemaName,
        schema,
        strict: false,
      },
    },
    previous_response_id: continuationState?.responseId || undefined,
  })

  return {
    data: extractStructuredJsonFromResponses(response),
    usage: response?.usage || null,
    raw: response,
    continuationState: response?.id ? { responseId: response.id } : continuationState,
  }
}

function supportsReasoningModel({ capabilities }) {
  return Boolean(capabilities?.supportsReasoning && capabilities?.supportsStructuredOutputs)
}

module.exports = {
  generateStructured,
  providerKey: 'openai',
  supportsReasoningModel,
}
