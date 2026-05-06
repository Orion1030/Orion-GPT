const { generateResumeFromJD } = require("../services/llm/resumeGenerate.service");

function sanitizeStr(s) {
  if (s == null) return "";
  return String(s)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .trim()
    .slice(0, 10000);
}

function dedupeStrings(items) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const clean = sanitizeStr(item);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

// Build resume JSON matching Resume model: name, summary, experiences[], skills[]
function normalizeResumeJson(raw) {
  const name = sanitizeStr(raw?.name) || "Generated Resume";
  const summary = sanitizeStr(raw?.summary) || "";
  const experiences = Array.isArray(raw?.experiences)
    ? raw.experiences.slice(0, 20).map((e) => {
        const legacySummary = sanitizeStr(e?.summary);
        const bullets = Array.isArray(e?.bullets)
          ? e.bullets.map(sanitizeStr).filter(Boolean)
          : Array.isArray(e?.descriptions)
            ? e.descriptions.map(sanitizeStr).filter(Boolean)
          : [];
        return {
          title: sanitizeStr(e?.title ?? e?.roleTitle) || "",
          companyName: sanitizeStr(e?.companyName) || "",
          companyLocation: sanitizeStr(e?.companyLocation) || "",
          bullets: dedupeStrings([legacySummary, ...bullets]),
          startDate: sanitizeStr(e?.startDate) || "",
          endDate: sanitizeStr(e?.endDate) || "",
        };
      })
    : [];

  const skills = Array.isArray(raw?.skills)
    ? raw.skills.slice(0, 10).map((s) => ({
        title: sanitizeStr(s?.title) || "Skills",
        items: Array.isArray(s?.items)
          ? s.items.map(sanitizeStr).filter(Boolean).slice(0, 50)
          : [],
      }))
    : [];

  const education = Array.isArray(raw?.education)
    ? raw.education.slice(0, 5).map((e) => ({
        degreeLevel: sanitizeStr(e?.degreeLevel) || "",
        universityName: sanitizeStr(e?.universityName) || "",
        major: sanitizeStr(e?.major) || "",
        startDate: sanitizeStr(e?.startDate) || "",
        endDate: sanitizeStr(e?.endDate) || "",
      }))
    : [];

  return { name, summary, experiences, skills, education, pageFrameConfig: null };
}

async function generateResumeJsonFromJD({ jd, profile, baseResume, auditContext = null }) {
  // LLM work (prompt + parse) is handled inside the specialized LLM service.
  const parsedResume = await generateResumeFromJD({ jd, profile, baseResume, auditContext });
  return normalizeResumeJson(parsedResume || { name: "Generated Resume", summary: "", experiences: [], skills: [], education: [] });
}

async function tryGenerateResumeJsonFromJD({ jd, profile, baseResume, auditContext = null }) {
  try {
    const resume = await generateResumeJsonFromJD({ jd, profile, baseResume, auditContext });
    return { result: { resume }, error: null };
  } catch (e) {
    return { result: null, error: { message: "Generation failed. Please try again.", statusCode: 502 } };
  }
}

module.exports = {
  sanitizeStr,
  normalizeResumeJson,
  generateResumeJsonFromJD,
  tryGenerateResumeJsonFromJD,
};
