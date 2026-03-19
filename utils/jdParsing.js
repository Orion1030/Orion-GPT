const sanitizeHtml = require("sanitize-html");
const { JobDescriptionModel } = require("../dbModels");
const { getEmbedding } = require("./embedding");
const { normalizeSkills } = require("./skillNormalizer");
const { parseJobDescriptionWithLLM } = require("../services/llm/jdParse.service");

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

async function createJobDescriptionRecordWithEmbedding({ userId, parsed, rawText }) {
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

  const textForEmbedding = [
    parsed.title || "",
    parsed.company || "",
    skills.join(" "),
    requirements.join(" "),
    responsibilities.join(" "),
  ]
    .filter(Boolean)
    .join("\n");

  const embedding = await getEmbedding(textForEmbedding);
  if (embedding) jd.embedding = embedding;

  await jd.save();
  return { jdId: jd._id.toString(), jd };
}

module.exports = {
  normalizeParsedJD,
  parseJobDescriptionWithLLM,
  createJobDescriptionRecordWithEmbedding,
};

