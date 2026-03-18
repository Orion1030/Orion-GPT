const sanitizeHtml = require("sanitize-html");
const { JobDescriptionModel } = require("../dbModels");
const { getEmbedding } = require("./embedding");
const { normalizeSkills } = require("./skillNormalizer");

const fetch = global.fetch || require("node-fetch");

function stripToText(s) {
  return sanitizeHtml(String(s ?? ""), { allowedTags: [], allowedAttributes: {} }).trim();
}

function normalizeParsedJD(parsed, rawText) {
  const out = parsed && typeof parsed === "object" ? { ...parsed } : {};
  out.title = stripToText(out.title || "Job");
  out.company = stripToText(out.company || "");

  out.skills = Array.isArray(out.skills) ? out.skills.map(stripToText).filter(Boolean) : [];
  out.skills = normalizeSkills(out.skills);

  out.requirements = Array.isArray(out.requirements)
    ? out.requirements.map(stripToText).filter(Boolean)
    : [];
  out.responsibilities = Array.isArray(out.responsibilities)
    ? out.responsibilities.map(stripToText).filter(Boolean)
    : [];

  // Store raw input for better traceability/debugging (optional).
  out.rawText = typeof rawText === "string" ? rawText : out.rawText;

  return out;
}

async function parseJobDescriptionWithLLM(text, openaiKey) {
  if (!openaiKey) throw new Error("LLM provider not configured");
  if (!text || typeof text !== "string" || !text.trim()) throw new Error("Text is required");

  const systemPrompt =
    "You are a job description parser. Extract structured data as JSON with keys: title, company (optional), skills (array of strings), requirements (array of strings), responsibilities (array of strings). Reply ONLY with valid JSON.";
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
          requirements: { type: "array", items: { type: "string" } },
          responsibilities: { type: "array", items: { type: "string" } },
        },
        required: ["title"],
        additionalProperties: true,
      },
    },
  ];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 2000,
      functions,
      function_call: { name: "parse_jd" },
    }),
  });

  const body = await resp.json();
  const msg = body?.choices?.[0]?.message;
  const funcArgs = msg?.function_call?.arguments;
  if (funcArgs) {
    return JSON.parse(funcArgs);
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

async function createJobDescriptionRecordWithEmbedding({ userId, parsed, rawText, openaiKey }) {
  const skills = normalizeSkills(parsed.skills || []);
  const requirements = Array.isArray(parsed.requirements) ? parsed.requirements : [];
  const responsibilities = Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [];

  const jd = new JobDescriptionModel({
    userId,
    title: parsed.title || "Job",
    company: parsed.company || "",
    skills,
    requirements,
    responsibilities,
    rawText: rawText || parsed.rawText || "",
  });

  if (openaiKey) {
    const textForEmbedding = [
      parsed.title || "",
      parsed.company || "",
      skills.join(" "),
      requirements.join(" "),
      responsibilities.join(" "),
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const embedding = await getEmbedding(textForEmbedding, openaiKey);
      if (embedding) jd.embedding = embedding;
    } catch {
      // continue without embedding
    }
  }

  await jd.save();
  return { jdId: jd._id.toString(), jd };
}

module.exports = {
  normalizeParsedJD,
  parseJobDescriptionWithLLM,
  createJobDescriptionRecordWithEmbedding,
};

