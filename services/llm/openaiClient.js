const fetch = global.fetch || require("node-fetch");

const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10);
const LLM_CHAT_TIMEOUT_MS = parseInt(process.env.LLM_CHAT_TIMEOUT_MS || String(LLM_TIMEOUT_MS), 10);
const LLM_RESPONSES_TIMEOUT_MS = parseInt(process.env.LLM_RESPONSES_TIMEOUT_MS || String(LLM_TIMEOUT_MS), 10);
const LLM_EMBED_TIMEOUT_MS = parseInt(process.env.LLM_EMBED_TIMEOUT_MS || String(LLM_TIMEOUT_MS), 10);
const LLM_RETRY_ATTEMPTS = parseInt(process.env.LLM_RETRY_ATTEMPTS || '3', 10);

function getOpenAIKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !String(key).trim()) throw new Error("LLM provider not configured");
  return key;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
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
  const key = getOpenAIKey();
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
  model,
  input,
  temperature = 0,
  max_output_tokens = 2000,
  response_format,
  reasoning, // { effort: "low" | "medium" | "high" }
  store,
  previous_response_id,
}) {
  const key = getOpenAIKey();
  const start = Date.now();

  const body = {
    model,
    input,
    temperature,
    max_output_tokens,
  };
  if (response_format) body.response_format = response_format;
  if (reasoning && typeof reasoning === "object") body.reasoning = reasoning;
  if (typeof store === "boolean") body.store = store;
  if (previous_response_id) body.previous_response_id = previous_response_id;

  const options = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };

  const result = await withRetry(async () => {
    const resp = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      options,
      LLM_RESPONSES_TIMEOUT_MS
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
  });

  const latencyMs = Date.now() - start;
  const usage = result.usage;
  console.log(
    `[LLM] responsesCreate model=${model} tokens=${usage?.total_tokens ?? '?'} ` +
    `input=${usage?.input_tokens ?? '?'} output=${usage?.output_tokens ?? '?'} ` +
    `reasoning=${usage?.output_tokens_details?.reasoning_tokens ?? '?'} latency=${latencyMs}ms`
  );

  return result;
}

module.exports = { chatCompletions, createEmbedding, responsesCreate };
