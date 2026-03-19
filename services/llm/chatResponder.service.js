const { chatCompletions } = require("./openaiClient");

async function getChatReply({ messages, temperature = 0.6, max_tokens = 1024 }) {
  const body = await chatCompletions({
    model: "gpt-4o-mini",
    messages,
    temperature,
    max_tokens,
  });

  const reply = body?.choices?.[0]?.message?.content;
  return typeof reply === "string" ? reply.trim() : null;
}

module.exports = { getChatReply };

