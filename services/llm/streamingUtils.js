async function* readTextChunks(body) {
  if (!body) return

  if (typeof body.getReader === 'function') {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        yield decoder.decode(value, { stream: true })
      }
      const rest = decoder.decode()
      if (rest) yield rest
    } finally {
      reader.releaseLock()
    }
    return
  }

  for await (const chunk of body) {
    if (typeof chunk === 'string') {
      yield chunk
    } else {
      yield Buffer.from(chunk).toString('utf8')
    }
  }
}

async function* readSseData(response) {
  let buffer = ''

  for await (const chunk of readTextChunks(response.body)) {
    buffer += chunk
    const parts = buffer.split(/\r?\n\r?\n/)
    buffer = parts.pop() || ''

    for (const part of parts) {
      const data = part
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')

      if (data) yield data
    }
  }

  const finalData = buffer
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')

  if (finalData) yield finalData
}

function isAbortError(error) {
  return (
    error?.name === 'AbortError' ||
    error?.code === 'ABORT_ERR' ||
    error?.code === 'ERR_ABORTED'
  )
}

function createLinkedAbortController(externalSignal, timeoutMs) {
  const controller = new AbortController()
  const effectiveTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : 0
  const abortFromExternalSignal = () => controller.abort(externalSignal.reason)
  const timer = effectiveTimeoutMs
    ? setTimeout(() => controller.abort(), effectiveTimeoutMs)
    : null

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason)
    } else {
      externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      if (timer) clearTimeout(timer)
      if (externalSignal) {
        externalSignal.removeEventListener('abort', abortFromExternalSignal)
      }
    },
  }
}

module.exports = {
  createLinkedAbortController,
  readSseData,
  readTextChunks,
  isAbortError,
}
