const { chatCompletions } = require("./openaiClient");
const { PARSE_MODEL } = require("../../config/llm");

async function parseResumeTextWithLLM(text) {
  const systemPrompt =
    "You are a resume parsing assistant. Extract structured resume data as JSON with keys: profile, summary, skills, meta. The profile must include: fullName, title, contactInfo (email, phone, linkedin, address), careerHistory (array of { roleTitle, companyName, startDate, endDate, keyPoints }), educations (array of { universityName, degreeLevel, major, startDate, endDate }). The meta object must include confidence (0..1) and missingFields (array). Use null for unknown values. Reply ONLY with valid JSON.";

  const userPrompt = `Parse the following resume text and return the JSON described above. Text:\n\n${text}`;

  const functions = [
    {
      name: "parse_resume",
      description: "Return a strict JSON object representing extracted resume sections.",
      parameters: {
        type: "object",
        properties: {
          profile: {
            type: "object",
            properties: {
              fullName: { type: ["string", "null"] },
              title: { type: ["string", "null"] },
              contactInfo: {
                type: "object",
                properties: {
                  email: { type: ["string", "null"] },
                  phone: { type: ["string", "null"] },
                  linkedin: { type: ["string", "null"] },
                  address: { type: ["string", "null"] },
                },
                additionalProperties: true,
              },
              careerHistory: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    roleTitle: { type: ["string", "null"] },
                    companyName: { type: ["string", "null"] },
                    startDate: { type: ["string", "null"] },
                    endDate: { type: ["string", "null"] },
                    keyPoints: { type: "array", items: { type: "string" } },
                  },
                  additionalProperties: true,
                },
              },
              educations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    universityName: { type: ["string", "null"] },
                    degreeLevel: { type: ["string", "null"] },
                    major: { type: ["string", "null"] },
                    startDate: { type: ["string", "null"] },
                    endDate: { type: ["string", "null"] },
                  },
                  additionalProperties: true,
                },
              },
            },
            additionalProperties: true,
          },
          summary: { type: ["string", "null"] },
          skills: { type: "array", items: { type: "string" } },
          meta: {
            type: "object",
            properties: {
              confidence: { type: "number" },
              missingFields: { type: "array", items: { type: "string" } },
            },
            additionalProperties: true,
          },
        },
        required: ["profile"],
        additionalProperties: true,
      },
    },
  ];

  const body = await chatCompletions({
    model: PARSE_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.0,
    max_tokens: 2000,
    functions,
    function_call: { name: "parse_resume" },
  });

  const msg = body?.choices?.[0]?.message;
  const funcArgs = msg?.function_call?.arguments;
  if (funcArgs) {
    try {
      return JSON.parse(funcArgs);
    } catch {
      // fallthrough
    }
  }

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

module.exports = { parseResumeTextWithLLM };

