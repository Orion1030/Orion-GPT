const { chatCompletions } = require("./openaiClient");
const { CHAT_MODEL, CHAT_MAX_TOKENS, CHAT_TIMEOUT_MS } = require("../../config/llm");
const { chatCompletionText } = require('./providerChat.client')

async function getChatReply({ messages, temperature = 0.6, max_tokens, runtimeConfig = null }) {
  const effectiveMaxTokens = Number(max_tokens) > 0 ? Number(max_tokens) : CHAT_MAX_TOKENS;
  if (runtimeConfig?.useCustom) {
    const providerResult = await chatCompletionText({
      provider: runtimeConfig.provider,
      apiKey: runtimeConfig.apiKey,
      model: runtimeConfig.model,
      messages,
      temperature,
      maxTokens: effectiveMaxTokens,
      timeoutMs: CHAT_TIMEOUT_MS,
    })
    const reply = String(providerResult?.text || '').trim()
    return reply || null
  }

  const body = await chatCompletions({
    model: CHAT_MODEL,
    messages,
    temperature,
    max_completion_tokens: effectiveMaxTokens,
    timeout_ms: CHAT_TIMEOUT_MS,
  });

  const reply = body?.choices?.[0]?.message?.content;
  return typeof reply === "string" ? reply.trim() : null;
}

async function tryGetChatReply({ messages, temperature, max_tokens, runtimeConfig = null }) {
  try {
    const reply = await getChatReply({ messages, temperature, max_tokens, runtimeConfig });
    return { result: { reply }, error: null };
  } catch (e) {
    return { result: null, error: { message: "Chat reply failed", statusCode: 502 } };
  }
}

module.exports = { getChatReply, tryGetChatReply };
