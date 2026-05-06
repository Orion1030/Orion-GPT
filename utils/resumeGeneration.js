const {
  generateApplicationMaterialsFromJD,
  generateResumeFromJD,
} = require("../services/llm/resumeGenerate.service");
const { normalizeResumeExperience } = require("./experienceAdapter");

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
        const normalized = normalizeResumeExperience(e);
        return {
          title: sanitizeStr(normalized.title) || "",
          companyName: sanitizeStr(normalized.companyName) || "",
          companyLocation: sanitizeStr(normalized.companyLocation) || "",
          bullets: dedupeStrings(normalized.bullets),
          startDate: sanitizeStr(normalized.startDate) || "",
          endDate: sanitizeStr(normalized.endDate) || "",
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

function normalizeCoverLetterJson(raw, { jd, profile } = {}) {
  const companyName = sanitizeStr(raw?.companyName) || sanitizeStr(jd?.company) || "";
  const jobTitle = sanitizeStr(raw?.jobTitle) || sanitizeStr(jd?.title) || "";
  const candidateName = sanitizeStr(profile?.fullName) || "Candidate";
  const bodyParagraphs = Array.isArray(raw?.bodyParagraphs)
    ? raw.bodyParagraphs.map(sanitizeStr).filter(Boolean).slice(0, 5)
    : [];

  return {
    title: sanitizeStr(raw?.title) || `${candidateName} - Cover Letter`,
    recipient: sanitizeStr(raw?.recipient) || "Hiring Manager",
    companyName,
    jobTitle,
    opening:
      sanitizeStr(raw?.opening) ||
      `I am excited to apply for the ${jobTitle || "role"}${companyName ? ` at ${companyName}` : ""}.`,
    bodyParagraphs: bodyParagraphs.length
      ? bodyParagraphs
      : [
          `${candidateName} brings experience aligned with this role and can contribute with grounded delivery from past work.`,
        ],
    closing:
      sanitizeStr(raw?.closing) ||
      "Thank you for your time and consideration. I would welcome the opportunity to discuss how my background fits this role.",
    signature: sanitizeStr(raw?.signature) || candidateName,
  };
}

function normalizeApplicationMaterialsJson(raw, { jd, profile } = {}) {
  const resumeSource = raw?.resume || raw;
  return {
    resume: normalizeResumeJson(resumeSource),
    coverLetter: normalizeCoverLetterJson(raw?.coverLetter, { jd, profile }),
  };
}

async function generateResumeJsonFromJD({ jd, profile, baseResume, auditContext = null }) {
  // LLM work (prompt + parse) is handled inside the specialized LLM service.
  const parsedResume = await generateResumeFromJD({ jd, profile, baseResume, auditContext });
  return normalizeResumeJson(parsedResume || { name: "Generated Resume", summary: "", experiences: [], skills: [], education: [] });
}

async function generateApplicationMaterialsJsonFromJD({ jd, profile, baseResume, auditContext = null }) {
  const parsedMaterials = await generateApplicationMaterialsFromJD({
    jd,
    profile,
    baseResume,
    auditContext,
  });
  return normalizeApplicationMaterialsJson(parsedMaterials || {}, { jd, profile });
}

async function tryGenerateResumeJsonFromJD({ jd, profile, baseResume, auditContext = null }) {
  try {
    const resume = await generateResumeJsonFromJD({ jd, profile, baseResume, auditContext });
    return { result: { resume }, error: null };
  } catch (e) {
    return { result: null, error: { message: "Generation failed. Please try again.", statusCode: 502 } };
  }
}

async function tryGenerateApplicationMaterialsJsonFromJD({ jd, profile, baseResume, auditContext = null }) {
  try {
    const materials = await generateApplicationMaterialsJsonFromJD({
      jd,
      profile,
      baseResume,
      auditContext,
    });
    return { result: materials, error: null };
  } catch (e) {
    return { result: null, error: { message: "Generation failed. Please try again.", statusCode: 502 } };
  }
}

module.exports = {
  sanitizeStr,
  normalizeResumeJson,
  normalizeCoverLetterJson,
  normalizeApplicationMaterialsJson,
  generateResumeJsonFromJD,
  generateApplicationMaterialsJsonFromJD,
  tryGenerateResumeJsonFromJD,
  tryGenerateApplicationMaterialsJsonFromJD,
};
