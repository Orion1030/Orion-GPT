const { chatCompletions } = require("./openaiClient");
const { GENERATE_MODEL } = require("../../config/llm");
const { resumeSchema } = require("./schemas/resumeSchemas");

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
      parameters: resumeSchema,
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
  let rawJson = null;

  // Try function_call arguments first (preferred method)
  if (choice?.message?.function_call?.arguments) {
    try {
      rawJson = JSON.parse(choice.message.function_call.arguments);
    } catch (e) {
      console.warn('[Generate] Failed to parse function_call arguments:', e.message);
      // fallthrough to content parsing
    }
  }

  // Fallback to content parsing
  if (!rawJson && choice?.message?.content) {
    try {
      rawJson = JSON.parse(choice.message.content);
    } catch (e) {
      console.warn('[Generate] Failed to parse content:', e.message);
      // Try to extract JSON from content using regex
      const jsonMatch = String(choice.message.content).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          rawJson = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.warn('[Generate] Failed regex extraction:', e2.message);
        }
      }
    }
  }

  if (!rawJson) {
    console.error('[Generate] No valid JSON found in LLM response');
    return normalizeResumeJson({ name: "Generated Resume", summary: "Failed to generate resume content", experiences: [], skills: [] });
  }

  return normalizeResumeJson(rawJson);
}

module.exports = { generateResumeFromJD };

