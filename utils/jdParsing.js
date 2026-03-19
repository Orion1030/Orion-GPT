const sanitizeHtml = require("sanitize-html");
const { getEmbedding } = require("./embedding");
const { normalizeSkills } = require("./skillNormalizer");
const { parseJobDescriptionWithLLM } = require("../services/llm/jdParse.service");

function stripToText(s) {
  return sanitizeHtml(String(s ?? ""), { allowedTags: [], allowedAttributes: {} }).trim();
}

function normalizeParsedJD(parsed) {
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

  return out;
}

async function getJobDescriptionEmbedding(parsed) {
  const textForEmbedding = buildJdEmbeddingText(parsed);
  return getEmbedding(textForEmbedding);
}

function buildJdEmbeddingText(parsed) {
  const safeParsed = parsed && typeof parsed === "object" ? parsed : {};
  const skills = normalizeSkills(safeParsed.skills || []);
  const requirements = Array.isArray(safeParsed.requirements) ? safeParsed.requirements : [];
  const responsibilities = Array.isArray(safeParsed.responsibilities) ? safeParsed.responsibilities : [];
  const textForEmbedding = [
    safeParsed.title || "",
    safeParsed.company || "",
    skills.join(" "),
    requirements.join(" "),
    responsibilities.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
  return textForEmbedding;
}

module.exports = {
  normalizeParsedJD,
  parseJobDescriptionWithLLM,
  getJobDescriptionEmbedding,
  buildJdEmbeddingText,
};

