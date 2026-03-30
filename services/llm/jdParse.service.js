const { chatCompletions } = require("./openaiClient");
const { JD_MODEL } = require("../../config/llm");

async function parseJobDescriptionWithLLM(text) {
  if (!text || typeof text !== "string" || !text.trim()) throw new Error("Text is required");

  const systemPrompt =
    "You are a job description parser. Extract structured data as JSON with keys: title, company (optional), skills (array of strings), niceToHave (array of strings, optional), requirements (array of strings), responsibilities (array of strings). Reply ONLY with valid JSON.";
  const userPrompt = `Parse this job description:\n\n${text}`;

  const functions = [
    {
      name: "parse_jd",
      description: "Return structured job description data.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          skills: { type: "array", items: { type: "string" } },
          niceToHave: { type: "array", items: { type: "string" } },
          requirements: { type: "array", items: { type: "string" } },
          responsibilities: { type: "array", items: { type: "string" } },
        },
        required: ["title"],
        additionalProperties: true,
      },
    },
  ];

  const body = await chatCompletions({
    model: JD_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0,
    max_tokens: 2000,
    functions,
    function_call: { name: "parse_jd" },
  });

  const msg = body?.choices?.[0]?.message;
  const funcArgs = msg?.function_call?.arguments;
  if (funcArgs) return JSON.parse(funcArgs);

  if (msg?.content) {
    try {
      return JSON.parse(msg.content);
    } catch {
      const m = String(msg.content).match(/\{[\s\S]*\}$/);
      if (m) return JSON.parse(m[0]);
    }
  }

  return null;
}

module.exports = { parseJobDescriptionWithLLM };

