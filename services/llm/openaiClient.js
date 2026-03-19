const fetch = global.fetch || require("node-fetch");

function getOpenAIKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !String(key).trim()) throw new Error("LLM provider not configured");
  return key;
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

  const body = {
    model,
    messages,
    temperature,
    max_tokens,
  };
  if (functions) body.functions = functions;
  if (function_call) body.function_call = function_call;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return resp.json();
}

async function createEmbedding({ model, input }) {
  const key = getOpenAIKey();

  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
    }),
  });

  return resp.json();
}

module.exports = {
  chatCompletions,
  createEmbedding,
};

