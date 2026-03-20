const fetch = global.fetch || require("node-fetch");

const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10);
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
        err.name === 'AbortError' ||
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
  temperature = 0,
  max_tokens = 2000,
  functions,
  function_call,
}) {
  const key = getOpenAIKey();
  const start = Date.now();

  const body = { model, messages, temperature, max_tokens };
  if (functions) body.functions = functions;
  if (function_call) body.function_call = function_call;

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
      "https://api.openai.com/v1/chat/completions",
      options,
      LLM_TIMEOUT_MS
    );
    if (!resp.ok) {
      const err = new Error(`OpenAI ${resp.status}: ${resp.statusText}`);
      err.status = resp.status;
      throw err;
    }
    return resp.json();
  });

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
      LLM_TIMEOUT_MS
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

module.exports = { chatCompletions, createEmbedding };
