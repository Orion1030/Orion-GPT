const { generateResumeFromJD } = require("../services/llm/resumeGenerate.service");

function sanitizeStr(s) {
  if (s == null) return "";
  return String(s)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .trim()
    .slice(0, 10000);
}

// Build resume JSON matching Resume model: name, summary, experiences[], skills[]
function normalizeResumeJson(raw) {
  const name = sanitizeStr(raw?.name) || "Generated Resume";
  const summary = sanitizeStr(raw?.summary) || "";
  const experiences = Array.isArray(raw?.experiences)
    ? raw.experiences.slice(0, 20).map((e) => ({
        title: sanitizeStr(e?.title ?? e?.roleTitle) || "",
        companyName: sanitizeStr(e?.companyName) || "",
        companyLocation: sanitizeStr(e?.companyLocation) || "",
        summary: sanitizeStr(e?.summary) || "",
        descriptions: Array.isArray(e?.descriptions)
          ? e.descriptions.map(sanitizeStr).filter(Boolean)
          : [],
        startDate: sanitizeStr(e?.startDate) || "",
        endDate: sanitizeStr(e?.endDate) || "",
      }))
    : [];

  const skills = Array.isArray(raw?.skills)
    ? raw.skills.slice(0, 10).map((s) => ({
        title: sanitizeStr(s?.title) || "Skills",
        items: Array.isArray(s?.items)
          ? s.items.map(sanitizeStr).filter(Boolean).slice(0, 50)
          : [],
      }))
    : [];

  return { name, summary, experiences, skills, pageFrameConfig: null };
}

async function generateResumeJsonFromJD({ jd, profile, baseResume }) {
  // LLM work (prompt + parse) is handled inside the specialized LLM service.
  const parsedResume = await generateResumeFromJD({ jd, profile, baseResume });
  return normalizeResumeJson(parsedResume || { name: "Generated Resume", summary: "", experiences: [], skills: [] });
}

module.exports = {
  sanitizeStr,
  normalizeResumeJson,
  generateResumeJsonFromJD,
};

