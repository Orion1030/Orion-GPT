const fetch = global.fetch || require('node-fetch')
const { chatCompletionsStream } = require('./openaiClient')
const { createLinkedAbortController, readSseData } = require('./streamingUtils')

const DEFAULT_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10)
const RETRY_ATTEMPTS = parseInt(process.env.LLM_RETRY_ATTEMPTS || '3', 10)

const PROVIDERS = {
  OPENAI: 'openai',
  CLAUDE: 'claude',
  GEMINI: 'gemini',
}

function sanitizeProvider(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === PROVIDERS.CLAUDE) return PROVIDERS.CLAUDE
  if (normalized === PROVIDERS.GEMINI) return PROVIDERS.GEMINI
  return PROVIDERS.OPENAI
}

function sanitizeModel(value) {
  return String(value || '').trim().slice(0, 120)
}

function sanitizeApiKey(value) {
  return String(value || '').trim().slice(0, 3000)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const controller = new AbortController()
  const externalSignal = options.signal
  const abortFromExternalSignal = () => controller.abort(externalSignal.reason)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason)
      } else {
        externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true })
      }
    }
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternalSignal)
    }
  }
}

async function withRetry(fn, attempts = RETRY_ATTEMPTS) {
  let lastErr
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const status = Number(err?.status || 0)
      const retryable = status === 429 || status >= 500
      if (!retryable || attempt === attempts) throw err
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000)
      console.warn(`[LLM] provider call attempt ${attempt} failed (${err.message}), retrying in ${delay}ms`)
      await sleep(delay)
    }
  }
  throw lastErr
}

async function openStreamingFetch(url, options = {}, timeoutMs, externalSignal) {
  const linkedAbort = createLinkedAbortController(externalSignal, timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: linkedAbort.signal,
    })
    return {
      response,
      cleanup: linkedAbort.cleanup,
    }
  } catch (err) {
    linkedAbort.cleanup()
    if (err?.name === 'AbortError' && !externalSignal?.aborted) {
      const timeoutErr = new Error(`Provider streaming request timed out after ${timeoutMs}ms`)
      timeoutErr.status = 408
      timeoutErr.code = 'timeout'
      throw timeoutErr
    }
    throw err
  }
}

function splitSystemMessage(messages = []) {
  const systemParts = []
  const nonSystemMessages = []

  for (const message of Array.isArray(messages) ? messages : []) {
    const role = String(message?.role || '').trim().toLowerCase()
    const content = String(message?.content || '')
    if (!content) continue
    if (role === 'system') {
      systemParts.push(content)
      continue
    }
    nonSystemMessages.push({
      role: role === 'assistant' ? 'assistant' : 'user',
      content,
    })
  }

  return {
    system: systemParts.join('\n\n').trim(),
    messages: nonSystemMessages,
  }
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function runOpenAiChat({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  timeoutMs,
  expectJson = false,
}) {
  const body = {
    model,
    messages,
    max_completion_tokens: maxTokens,
  }
  if (temperature !== undefined && temperature !== null) {
    body.temperature = temperature
  }
  if (expectJson) {
    body.response_format = { type: 'json_object' }
  }

  const options = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    options,
    timeoutMs
  )
  const text = await response.text()
  const parsed = parseJsonSafe(text)
  if (!response.ok) {
    const error = new Error(
      `OpenAI ${response.status}: ${response.statusText} - ${JSON.stringify(parsed || text)}`
    )
    error.status = response.status
    error.body = parsed || text
    throw error
  }
  if (!parsed) {
    const error = new Error(`Invalid JSON response from OpenAI: ${text}`)
    error.status = response.status
    throw error
  }

  const content = parsed?.choices?.[0]?.message?.content
  return {
    text: typeof content === 'string' ? content : '',
    usage: parsed?.usage || null,
    finishReason: parsed?.choices?.[0]?.finish_reason || null,
    raw: parsed,
  }
}

async function runAnthropicChat({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  timeoutMs,
}) {
  const split = splitSystemMessage(messages)
  const body = {
    model,
    max_tokens: maxTokens,
    messages: split.messages.map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content,
    })),
  }
  if (split.system) {
    body.system = split.system
  }
  if (temperature !== undefined && temperature !== null) {
    body.temperature = temperature
  }

  const options = {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }

  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    options,
    timeoutMs
  )
  const text = await response.text()
  const parsed = parseJsonSafe(text)
  if (!response.ok) {
    const error = new Error(
      `Claude ${response.status}: ${response.statusText} - ${JSON.stringify(parsed || text)}`
    )
    error.status = response.status
    error.body = parsed || text
    throw error
  }
  if (!parsed) {
    const error = new Error(`Invalid JSON response from Claude: ${text}`)
    error.status = response.status
    throw error
  }

  const contentParts = Array.isArray(parsed?.content) ? parsed.content : []
  const responseText = contentParts
    .filter((part) => part?.type === 'text')
    .map((part) => String(part?.text || ''))
    .join('\n')

  return {
    text: responseText,
    usage: parsed?.usage || null,
    finishReason: parsed?.stop_reason || null,
    raw: parsed,
  }
}

function toGeminiRole(role) {
  return role === 'assistant' ? 'model' : 'user'
}

async function runGeminiChat({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  timeoutMs,
}) {
  const split = splitSystemMessage(messages)
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`

  const body = {
    contents: split.messages.map((item) => ({
      role: toGeminiRole(item.role),
      parts: [{ text: item.content }],
    })),
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  }
  if (temperature !== undefined && temperature !== null) {
    body.generationConfig.temperature = temperature
  }
  if (split.system) {
    body.systemInstruction = {
      parts: [{ text: split.system }],
    }
  }

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  )
  const text = await response.text()
  const parsed = parseJsonSafe(text)
  if (!response.ok) {
    const error = new Error(
      `Gemini ${response.status}: ${response.statusText} - ${JSON.stringify(parsed || text)}`
    )
    error.status = response.status
    error.body = parsed || text
    throw error
  }
  if (!parsed) {
    const error = new Error(`Invalid JSON response from Gemini: ${text}`)
    error.status = response.status
    throw error
  }

  const candidate = Array.isArray(parsed?.candidates) ? parsed.candidates[0] : null
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
  const responseText = parts.map((part) => String(part?.text || '')).join('\n')

  return {
    text: responseText,
    usage: parsed?.usageMetadata || null,
    finishReason: candidate?.finishReason || null,
    raw: parsed,
  }
}

async function* streamOpenAiChat({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  timeoutMs,
  signal,
}) {
  yield* chatCompletionsStream({
    apiKey,
    model,
    messages,
    temperature,
    max_completion_tokens: maxTokens,
    timeout_ms: timeoutMs,
    signal,
  })
}

async function* streamAnthropicChat({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  timeoutMs,
  signal,
}) {
  const split = splitSystemMessage(messages)
  const body = {
    model,
    max_tokens: maxTokens,
    messages: split.messages.map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content,
    })),
    stream: true,
  }
  if (split.system) {
    body.system = split.system
  }
  if (temperature !== undefined && temperature !== null) {
    body.temperature = temperature
  }

  const { response, cleanup } = await openStreamingFetch(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
    signal
  )
  try {
    const errorText = response.ok ? '' : await response.text()
    const errorParsed = errorText ? parseJsonSafe(errorText) : null
    if (!response.ok) {
      const error = new Error(
        `Claude ${response.status}: ${response.statusText} - ${JSON.stringify(errorParsed || errorText)}`
      )
      error.status = response.status
      error.body = errorParsed || errorText
      throw error
    }

    for await (const data of readSseData(response)) {
      let parsed
      try {
        parsed = JSON.parse(data)
      } catch {
        continue
      }
      if (parsed?.type === 'error') {
        const error = new Error(parsed?.error?.message || 'Claude streaming failed')
        error.status = parsed?.error?.status || 502
        error.body = parsed?.error || parsed
        throw error
      }
      const token = parsed?.type === 'content_block_delta' && parsed?.delta?.type === 'text_delta'
        ? parsed.delta.text
        : ''
      if (token) yield token
    }
  } finally {
    cleanup()
  }
}

async function* streamGeminiChat({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  timeoutMs,
  signal,
}) {
  const split = splitSystemMessage(messages)
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
  const body = {
    contents: split.messages.map((item) => ({
      role: toGeminiRole(item.role),
      parts: [{ text: item.content }],
    })),
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  }
  if (temperature !== undefined && temperature !== null) {
    body.generationConfig.temperature = temperature
  }
  if (split.system) {
    body.systemInstruction = {
      parts: [{ text: split.system }],
    }
  }

  const { response, cleanup } = await openStreamingFetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
    signal
  )
  try {
    const errorText = response.ok ? '' : await response.text()
    const errorParsed = errorText ? parseJsonSafe(errorText) : null
    if (!response.ok) {
      const error = new Error(
        `Gemini ${response.status}: ${response.statusText} - ${JSON.stringify(errorParsed || errorText)}`
      )
      error.status = response.status
      error.body = errorParsed || errorText
      throw error
    }

    for await (const data of readSseData(response)) {
      let parsed
      try {
        parsed = JSON.parse(data)
      } catch {
        continue
      }
      const candidate = Array.isArray(parsed?.candidates) ? parsed.candidates[0] : null
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
      const token = parts.map((part) => String(part?.text || '')).join('')
      if (token) yield token
    }
  } finally {
    cleanup()
  }
}

async function chatCompletionText({
  provider = PROVIDERS.OPENAI,
  apiKey,
  model,
  messages,
  temperature = 0.6,
  maxTokens = 1200,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  expectJson = false,
} = {}) {
  const normalizedProvider = sanitizeProvider(provider)
  const normalizedApiKey = sanitizeApiKey(apiKey)
  const normalizedModel = sanitizeModel(model)
  const effectiveTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS
  const effectiveMaxTokens = Math.max(1, Number(maxTokens) || 1200)

  if (!normalizedApiKey) {
    throw new Error('LLM api key is required')
  }
  if (!normalizedModel) {
    throw new Error('LLM model is required')
  }

  const start = Date.now()
  const result = await withRetry(async () => {
    if (normalizedProvider === PROVIDERS.CLAUDE) {
      return runAnthropicChat({
        apiKey: normalizedApiKey,
        model: normalizedModel,
        messages,
        temperature,
        maxTokens: effectiveMaxTokens,
        timeoutMs: effectiveTimeoutMs,
      })
    }
    if (normalizedProvider === PROVIDERS.GEMINI) {
      return runGeminiChat({
        apiKey: normalizedApiKey,
        model: normalizedModel,
        messages,
        temperature,
        maxTokens: effectiveMaxTokens,
        timeoutMs: effectiveTimeoutMs,
      })
    }
    return runOpenAiChat({
      apiKey: normalizedApiKey,
      model: normalizedModel,
      messages,
      temperature,
      maxTokens: effectiveMaxTokens,
      timeoutMs: effectiveTimeoutMs,
      expectJson,
    })
  })

  const latencyMs = Date.now() - start
  console.log(
    `[LLM] providerChat provider=${normalizedProvider} model=${normalizedModel} latency=${latencyMs}ms`
  )
  return {
    provider: normalizedProvider,
    model: normalizedModel,
    latencyMs,
    ...result,
  }
}

async function* chatCompletionStream({
  provider = PROVIDERS.OPENAI,
  apiKey,
  model,
  messages,
  temperature = 0.6,
  maxTokens = 1200,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
} = {}) {
  const normalizedProvider = sanitizeProvider(provider)
  const normalizedApiKey = sanitizeApiKey(apiKey)
  const normalizedModel = sanitizeModel(model)
  const effectiveTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS
  const effectiveMaxTokens = Math.max(1, Number(maxTokens) || 1200)

  if (!normalizedApiKey) {
    throw new Error('LLM api key is required')
  }
  if (!normalizedModel) {
    throw new Error('LLM model is required')
  }

  const start = Date.now()
  let chunks = 0
  const streamArgs = {
    apiKey: normalizedApiKey,
    model: normalizedModel,
    messages,
    temperature,
    maxTokens: effectiveMaxTokens,
    timeoutMs: effectiveTimeoutMs,
    signal,
  }

  const stream = normalizedProvider === PROVIDERS.CLAUDE
    ? streamAnthropicChat(streamArgs)
    : normalizedProvider === PROVIDERS.GEMINI
      ? streamGeminiChat(streamArgs)
      : streamOpenAiChat(streamArgs)

  for await (const token of stream) {
    chunks += 1
    yield token
  }

  const latencyMs = Date.now() - start
  console.log(
    `[LLM] providerChatStream provider=${normalizedProvider} model=${normalizedModel} chunks=${chunks} latency=${latencyMs}ms`
  )
}

module.exports = {
  PROVIDERS,
  chatCompletionText,
  chatCompletionStream,
}
