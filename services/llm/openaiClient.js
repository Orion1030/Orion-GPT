const fetch = global.fetch || require("node-fetch");
const { createLinkedAbortController, readSseData } = require("./streamingUtils");

const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10);
const LLM_CHAT_TIMEOUT_MS = parseInt(process.env.LLM_CHAT_TIMEOUT_MS || String(LLM_TIMEOUT_MS), 10);
const LLM_RESPONSES_TIMEOUT_MS = parseInt(process.env.LLM_RESPONSES_TIMEOUT_MS || String(LLM_TIMEOUT_MS), 10);
const LLM_EMBED_TIMEOUT_MS = parseInt(process.env.LLM_EMBED_TIMEOUT_MS || String(LLM_TIMEOUT_MS), 10);
const LLM_RETRY_ATTEMPTS = parseInt(process.env.LLM_RETRY_ATTEMPTS || '3', 10);

function getOpenAIKey(overrideKey = null) {
  const key = overrideKey || process.env.OPENAI_API_KEY;
  if (!key || !String(key).trim()) throw new Error("LLM provider not configured");
  return key;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromExternalSignal = () => controller.abort(externalSignal.reason);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
      }
    }
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternalSignal);
    }
  }
}

async function withRetry(fn, attempts = LLM_RETRY_ATTEMPTS) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isRetryable =
        (err.status && (err.status === 429 || err.status >= 500));
      if (!isRetryable || attempt === attempts) throw err;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.warn(`[LLM] attempt ${attempt} failed (${err.message}), retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function chatCompletions({
  apiKey,
  model,
  messages,
  temperature,
  max_completion_tokens,
  max_tokens, // legacy name; mapped to max_completion_tokens
  response_format,
  functions,
  function_call,
  timeout_ms, // optional per-request timeout override
}) {
  const key = getOpenAIKey(apiKey);
  const start = Date.now();
  const effectiveChatTimeoutMs = Number(timeout_ms) > 0 ? Number(timeout_ms) : LLM_CHAT_TIMEOUT_MS;

  const baseBody = {
    model,
    messages,
    max_completion_tokens: max_completion_tokens ?? max_tokens ?? 2000,
  };
  if (temperature !== undefined && temperature !== null) {
    baseBody.temperature = temperature;
  }
  if (response_format) baseBody.response_format = response_format;
  if (functions) baseBody.functions = functions;
  if (function_call) baseBody.function_call = function_call;

  async function send(body) {
    const options = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    };

    let resp;
    try {
      resp = await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        options,
        effectiveChatTimeoutMs
      );
    } catch (err) {
      if (err?.name === "AbortError") {
        const timeoutErr = new Error(`OpenAI request timed out after ${effectiveChatTimeoutMs}ms`);
        timeoutErr.status = 408;
        timeoutErr.code = "timeout";
        throw timeoutErr;
      }
      throw err;
    }

    const text = await resp.text();

    if (!resp.ok) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      const err = new Error(`OpenAI ${resp.status}: ${resp.statusText} - ${JSON.stringify(parsed)}`);
      err.status = resp.status;
      err.body = parsed;
      throw err;
    }

    try {
      return JSON.parse(text);
    } catch {
      const err = new Error(`Invalid JSON response from OpenAI: ${text}`);
      err.status = resp.status;
      err.body = text;
      throw err;
    }
  }

  let result;
  try {
    result = await withRetry(() => send(baseBody));
  } catch (err) {
    const unsupportedTemp =
      err?.status === 400 &&
      err?.body?.error?.param === "temperature" &&
      baseBody.temperature !== undefined;
    if (unsupportedTemp) {
      console.warn(`[LLM] temperature not supported for model=${model}; retrying with default temperature`);
      const { temperature: _discard, ...bodyWithoutTemp } = baseBody;
      result = await withRetry(() => send(bodyWithoutTemp));
    } else {
      throw err;
    }
  }

  const latencyMs = Date.now() - start;
  const usage = result.usage;
  console.log(
    `[LLM] chatCompletions model=${model} tokens=${usage?.total_tokens ?? '?'} ` +
    `prompt=${usage?.prompt_tokens ?? '?'} completion=${usage?.completion_tokens ?? '?'} ` +
    `latency=${latencyMs}ms`
  );

  return result;
}

async function* chatCompletionsStream({
  apiKey,
  model,
  messages,
  temperature,
  max_completion_tokens,
  max_tokens,
  timeout_ms,
  signal,
}) {
  const key = getOpenAIKey(apiKey);
  const start = Date.now();
  const effectiveChatTimeoutMs = Number(timeout_ms) > 0 ? Number(timeout_ms) : LLM_CHAT_TIMEOUT_MS;
  const body = {
    model,
    messages,
    max_completion_tokens: max_completion_tokens ?? max_tokens ?? 2000,
    stream: true,
  };
  if (temperature !== undefined && temperature !== null) {
    body.temperature = temperature;
  }

  async function openStream(requestBody) {
    const linkedAbort = createLinkedAbortController(signal, effectiveChatTimeoutMs);
    const options = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: linkedAbort.signal,
    };

    let resp;
    try {
      resp = await fetch(
        "https://api.openai.com/v1/chat/completions",
        options
      );
    } catch (err) {
      linkedAbort.cleanup();
      if (err?.name === "AbortError") {
        if (signal?.aborted) throw err;
        const timeoutErr = new Error(`OpenAI streaming request timed out after ${effectiveChatTimeoutMs}ms`);
        timeoutErr.status = 408;
        timeoutErr.code = "timeout";
        throw timeoutErr;
      }
      throw err;
    }

    if (resp.ok) return { resp, cleanup: linkedAbort.cleanup };

    const text = await resp.text();
    linkedAbort.cleanup();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    const err = new Error(`OpenAI ${resp.status}: ${resp.statusText} - ${JSON.stringify(parsed)}`);
    err.status = resp.status;
    err.body = parsed;
    throw err;
  }

  let resp;
  let cleanupStream = () => {};
  try {
    const opened = await openStream(body);
    resp = opened.resp;
    cleanupStream = opened.cleanup;
  } catch (err) {
    const unsupportedTemp =
      err?.status === 400 &&
      err?.body?.error?.param === "temperature" &&
      body.temperature !== undefined;
    if (!unsupportedTemp) throw err;
    console.warn(`[LLM] streaming temperature not supported for model=${model}; retrying with default temperature`);
    const { temperature: _discard, ...bodyWithoutTemp } = body;
    const opened = await openStream(bodyWithoutTemp);
    resp = opened.resp;
    cleanupStream = opened.cleanup;
  }

  let totalTokens = 0;
  try {
    for await (const data of readSseData(resp)) {
      if (data === "[DONE]") break;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const token = parsed?.choices?.[0]?.delta?.content || "";
      if (token) {
        totalTokens += 1;
        yield token;
      }
    }
  } finally {
    cleanupStream();
  }

  const latencyMs = Date.now() - start;
  console.log(
    `[LLM] chatCompletionsStream model=${model} chunks=${totalTokens} latency=${latencyMs}ms`
  );
}

async function createEmbedding({ model, input }) {
  const key = getOpenAIKey();
  const start = Date.now();

  const options = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  };

  const result = await withRetry(async () => {
    const resp = await fetchWithTimeout(
      "https://api.openai.com/v1/embeddings",
      options,
      LLM_EMBED_TIMEOUT_MS
    );
    if (!resp.ok) {
      const err = new Error(`OpenAI ${resp.status}: ${resp.statusText}`);
      err.status = resp.status;
      throw err;
    }
    return resp.json();
  });

  const latencyMs = Date.now() - start;
  console.log(`[LLM] createEmbedding model=${model} tokens=${result.usage?.total_tokens ?? '?'} latency=${latencyMs}ms`);

  return result;
}

async function responsesCreate({
  apiKey,
  model,
  input,
  temperature,
  max_output_tokens = 2000,
  response_format,
  text,
  reasoning, // { effort: "low" | "medium" | "high" }
  store,
  previous_response_id,
  timeout_ms,
}) {
  const key = getOpenAIKey(apiKey);
  const start = Date.now();
  const effectiveResponsesTimeoutMs =
    Number(timeout_ms) > 0 ? Number(timeout_ms) : LLM_RESPONSES_TIMEOUT_MS;

  const body = {
    model,
    input,
    max_output_tokens,
  };
  if (temperature !== undefined && temperature !== null) body.temperature = temperature;
  if (response_format) body.response_format = response_format;
  if (text) body.text = text;
  if (reasoning && typeof reasoning === "object") body.reasoning = reasoning;
  if (typeof store === "boolean") body.store = store;
  if (previous_response_id) body.previous_response_id = previous_response_id;

  async function send(requestBody) {
    const options = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    };

    const resp = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      options,
      effectiveResponsesTimeoutMs
    );

    const text = await resp.text();

    if (!resp.ok) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      const err = new Error(
        `OpenAI ${resp.status}: ${resp.statusText} - ${JSON.stringify(parsed, null, 2)}`
      );
      err.status = resp.status;
      err.body = parsed;
      throw err;
    }

    try {
      return JSON.parse(text);
    } catch {
      const err = new Error(`Invalid JSON response from OpenAI: ${text}`);
      err.status = resp.status;
      err.body = text;
      throw err;
    }
  }

  let result;
  try {
    result = await withRetry(() => send(body));
  } catch (err) {
    const unsupportedTemp =
      err?.status === 400 &&
      err?.body?.error?.param === "temperature" &&
      body.temperature !== undefined;
    if (unsupportedTemp) {
      console.warn(
        `[LLM] responses temperature not supported for model=${model}; retrying without temperature`
      );
      const { temperature: _discard, ...bodyWithoutTemp } = body;
      result = await withRetry(() => send(bodyWithoutTemp));
    } else {
      throw err;
    }
  }

  const latencyMs = Date.now() - start;
  const usage = result.usage;
  console.log(
    `[LLM] responsesCreate model=${model} tokens=${usage?.total_tokens ?? '?'} ` +
    `input=${usage?.input_tokens ?? '?'} output=${usage?.output_tokens ?? '?'} ` +
    `reasoning=${usage?.output_tokens_details?.reasoning_tokens ?? '?'} latency=${latencyMs}ms`
  );

  return result;
}

module.exports = { chatCompletions, chatCompletionsStream, createEmbedding, responsesCreate };
