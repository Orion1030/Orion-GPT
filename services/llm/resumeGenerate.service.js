const { responsesCreate } = require("./openaiClient");
const { GENERATE_MODEL, GENERATE_MAX_TOKENS } = require("../../config/llm");
const { resumeSchema } = require("./schemas/resumeSchemas");
const {
  buildResumeGenerationSystemPrompt,
  buildResumeGenerationUserPrompt,
} = require("./prompts/resumeGenerate.prompts");

function sanitizeStr(s) {
  if (s == null) return "";
  return String(s).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").trim().slice(0, 10000);
}

function formatDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return sanitizeStr(value);
  return date.toISOString().slice(0, 10);
}

function normalizeCareerHistoryForPrompt(careerHistory) {
  if (!Array.isArray(careerHistory)) return [];

  return careerHistory.slice(0, 20).map((item) => ({
    companyName: sanitizeStr(item?.companyName),
    roleTitle: sanitizeStr(item?.roleTitle),
    startDate: formatDate(item?.startDate),
    endDate: formatDate(item?.endDate),
    companySummary: sanitizeStr(item?.companySummary),
    keyPoints: Array.isArray(item?.keyPoints)
      ? item.keyPoints.map(sanitizeStr).filter(Boolean).slice(0, 20)
      : [],
  }));
}

function normalizeEducationForPrompt(education) {
  if (!Array.isArray(education)) return [];

  return education.slice(0, 10).map((item) => ({
    degreeLevel: sanitizeStr(item?.degreeLevel),
    universityName: sanitizeStr(item?.universityName),
    major: sanitizeStr(item?.major),
    startDate: formatDate(item?.startDate),
    endDate: formatDate(item?.endDate),
    note: sanitizeStr(item?.note),
  }));
}

function normalizeResumeForPrompt(resume) {
  return {
    title: sanitizeStr(resume?.title),
    summary: sanitizeStr(resume?.summary),
    experiences: Array.isArray(resume?.experiences)
      ? resume.experiences.slice(0, 20).map((item) => ({
          title: sanitizeStr(item?.title ?? item?.roleTitle),
          companyName: sanitizeStr(item?.companyName),
          companyLocation: sanitizeStr(item?.companyLocation),
          summary: sanitizeStr(item?.summary),
          descriptions: Array.isArray(item?.descriptions)
            ? item.descriptions.map(sanitizeStr).filter(Boolean).slice(0, 20)
            : [],
          startDate: formatDate(item?.startDate),
          endDate: formatDate(item?.endDate),
        }))
      : [],
    skills: Array.isArray(resume?.skills)
      ? resume.skills.slice(0, 12).map((item) => ({
          title: sanitizeStr(item?.title),
          items: Array.isArray(item?.items)
            ? item.items.map(sanitizeStr).filter(Boolean).slice(0, 60)
            : [],
        }))
      : [],
    education: normalizeEducationForPrompt(resume?.education),
  };
}

function buildResumeGenerationInput({ jd, profile, baseResume }) {
  return {
    jobDescription: {
      title: sanitizeStr(jd?.title),
      company: sanitizeStr(jd?.company) || "N/A",
      context: sanitizeStr(jd?.context) || "N/A",
      skills: Array.isArray(jd?.skills) ? jd.skills.map(sanitizeStr).filter(Boolean).slice(0, 50) : [],
      niceToHave: Array.isArray(jd?.niceToHave) ? jd.niceToHave.map(sanitizeStr).filter(Boolean).slice(0, 30) : [],
      requirements: Array.isArray(jd?.requirements) ? jd.requirements.map(sanitizeStr).filter(Boolean).slice(0, 40) : [],
      responsibilities: Array.isArray(jd?.responsibilities) ? jd.responsibilities.map(sanitizeStr).filter(Boolean).slice(0, 40) : [],
    },
    candidateProfile: {
      fullName: sanitizeStr(profile?.fullName),
      currentTitle: sanitizeStr(profile?.title),
      mainStack: sanitizeStr(profile?.mainStack),
      careerHistoryContext: normalizeCareerHistoryForPrompt(profile?.careerHistory),
      education: normalizeEducationForPrompt(profile?.educations),
    },
    originalResume: normalizeResumeForPrompt(baseResume),
  };
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

async function generateResumeFromJD({ jd, profile, baseResume }) {
  if (!jd || !profile) throw new Error("JD or profile not found");

  const llmInput = buildResumeGenerationInput({ jd, profile, baseResume });
  const systemPrompt = buildResumeGenerationSystemPrompt();
  const userPrompt = buildResumeGenerationUserPrompt(llmInput);

  const body = await responsesCreate({
    model: GENERATE_MODEL,
    input: [
      { role: "developer", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "generate_resume",
        schema: resumeSchema,
        strict: true,
      },
    },
    temperature: 0.2,
    max_output_tokens: GENERATE_MAX_TOKENS,
  });

  const outputItems = Array.isArray(body?.output) ? body.output : [];
  let textChunk = outputItems
    .flatMap((item) => item?.content || [])
    .find((c) => typeof c?.text === "string")
    ?.text;
  if (!textChunk && typeof body?.output_text === "string") {
    textChunk = body.output_text;
  }

  let rawJson = null;
  if (textChunk) {
    try {
      rawJson = JSON.parse(textChunk);
    } catch (e) {
      console.warn('[Generate] Failed to parse structured text:', e.message);
    }
  }

  if (!rawJson) {
    console.error('[Generate] No valid JSON found in LLM response');
    return normalizeResumeJson({ name: "Generated Resume", summary: "Failed to generate resume content", experiences: [], skills: [], education: [] });
  }

  return normalizeResumeJson(rawJson);
}

module.exports = { generateResumeFromJD };
