const { chatCompletions } = require("./openaiClient");
const { GENERATE_MODEL } = require("../../config/llm");
const e = require("express");

function sanitizeStr(s) {
  if (s == null) return "";
  return String(s).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").trim().slice(0, 10000);
}

function normalizeResumeJson(raw) {
  const name = sanitizeStr(raw?.name) || "Generated Resume";
  const summary = sanitizeStr(raw?.summary) || "";
  const experiences = Array.isArray(raw?.experiences)
    ? raw.experiences.slice(0, 20).map((e) => ({
        title: sanitizeStr(e?.title ?? e?.roleTitle) || "",
        companyName: sanitizeStr(e?.companyName) || "",
        companyLocation: sanitizeStr(e?.companyLocation) || "",
        summary: sanitizeStr(e?.summary) || "",
        descriptions: Array.isArray(e?.descriptions) ? e.descriptions.map(sanitizeStr).filter(Boolean) : [],
        startDate: sanitizeStr(e?.startDate) || "",
        endDate: sanitizeStr(e?.endDate) || "",
      }))
    : [];

  const skills = Array.isArray(raw?.skills)
    ? raw.skills.slice(0, 10).map((s) => ({
        title: sanitizeStr(s?.title) || "Skills",
        items: Array.isArray(s?.items) ? s.items.map(sanitizeStr).filter(Boolean).slice(0, 50) : [],
      }))
    : [];

  return { name, summary, experiences, skills, pageFrameConfig: null };
}

async function generateResumeFromJD({ jd, profile, baseResume }) {
  if (!jd || !profile) throw new Error("JD or profile not found");

  const llmInput = {
    jobDescription: {
      title: jd.title || "",
      company: jd.company || "N/A",
      context: jd.context || "N/A",
    },
    profile: {
      fullName: profile.fullName || "",
      title: profile.title || "",
      careerHistory: profile.careerHistory || [],
      education: profile.education || [],
    },
    originalResume: {
      title: baseResume?.title || "",
      summary: baseResume?.summary || "",
      experiences: baseResume?.experiences || [],
      skills: baseResume?.skills || [],
    },
  };

  const systemPrompt = `You are a resume writing expert. Generate a resume as a single JSON object with the exact shape defined in the function schema, and do not include narrative text outside the JSON.`;

  const userPrompt = `Input data (JSON):\n${JSON.stringify(llmInput, null, 2)}\n\nGenerate the resume as one JSON object (no markdown, no code fences).`;

  const functions = [
    {
      name: "generate_resume",
      description: "Structured resume JSON result",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          summary: { type: "string" },
          experiences: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                companyName: { type: "string" },
                companyLocation: { type: "string" },
                summary: { type: "string" },
                descriptions: { type: "array", items: { type: "string" } },
                startDate: { type: "string" },
                endDate: { type: "string" },
              },
              required: ["title", "companyName", "descriptions", "startDate", "endDate"],
            },
          },
          skills: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                items: { type: "array", items: { type: "string" } },
              },
              required: ["title", "items"],
            },
          },
          education: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["name", "summary", "experiences", "skills"],
      },
    },
  ];

  const body = await chatCompletions({
    model: GENERATE_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    functions,
    function_call: { name: "generate_resume" },
    temperature: 0.2,
    max_tokens: 2000,
  });

  const choice = body?.choices?.[0];
  let raw = "";

  if (choice?.message?.function_call?.arguments) {
    raw = choice.message.function_call.arguments;
  } else {
    raw = choice?.message?.content || "";
  }

  try {
    return normalizeResumeJson(JSON.parse(raw));
  } catch (e) {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return normalizeResumeJson(JSON.parse(jsonMatch[0]));
      } catch {
        // ignore and fallback
      }
    }
  }

  return normalizeResumeJson({ name: "Generated Resume", summary: raw.slice(0, 500), experiences: [], skills: [] });
}

module.exports = { generateResumeFromJD };

