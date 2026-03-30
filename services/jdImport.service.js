const {
  normalizeParsedJD,
  parseJobDescriptionWithLLM,
  getJobDescriptionEmbedding,
} = require("../utils/jdParsing");
const { findTopResumesCore } = require("./findTopResumes");
const { findTopProfilesCore } = require("./findTopProfiles");
const { JobDescriptionModel } = require("../dbModels");

function resolveJdContext(payload) {
  const { context, text } = payload || {};
  return typeof context === "string" ? context : text;
}

async function tryParseAndPersistJobDescription({ userId, jdContext }) {
  try {
    const parsed = await parseJobDescriptionWithLLM(jdContext);
    if (!parsed) {
      return {
        result: null,
        error: { message: "Failed to parse JD", statusCode: 502 },
      };
    }

    const normalized = normalizeParsedJD(parsed);
    const skills = normalized.skills || [];
    const niceToHave = normalized.niceToHave || [];
    const requirements = normalized.requirements || [];
    const responsibilities = normalized.responsibilities || [];
    const embedding = await getJobDescriptionEmbedding(normalized);

    const jd = new JobDescriptionModel({
      userId,
      title: normalized.title || "Job",
      company: normalized.company || "",
      skills,
      niceToHave,
      requirements,
      responsibilities,
      context: jdContext,
    });
    if (embedding) jd.embedding = embedding;
    await jd.save();

    return {
      result: { jdId: jd._id.toString(), parsed: normalized },
      error: null,
    };
  } catch (e) {
    return {
      result: null,
      error: { message: "LLM parse failed", statusCode: 502 },
    };
  }
}

async function tryFindTopResumesForJobDescription({ userId, jdId, profileId }) {
  try {
    const { topResumes, error } = await findTopResumesCore(userId, jdId, profileId);
    if (error) {
      return {
        result: null,
        error: { message: error, statusCode: 404 },
      };
    }
    return {
      result: { topResumes: topResumes || [] },
      error: null,
    };
  } catch (e) {
    return {
      result: null,
      error: { message: "Failed to find top resumes", statusCode: 502 },
    };
  }
}

async function tryFindTopProfilesForJobDescription({ userId, jdId }) {
  try {
    const { topProfiles, error } = await findTopProfilesCore(userId, jdId);
    if (error) {
      return { result: null, error: { message: error, statusCode: 404 } };
    }
    return { result: { topProfiles: topProfiles || [] }, error: null };
  } catch (e) {
    return { result: null, error: { message: "Failed to find top profiles", statusCode: 502 } };
  }
}

/**
 * Persist an already-parsed and normalized JD (used by the jdParser agent,
 * which handles its own LLM call and then delegates saving here).
 */
async function persistParsedJobDescription({ userId, normalized, context }) {
  const skills = normalized.skills || [];
  const niceToHave = normalized.niceToHave || [];
  const requirements = normalized.requirements || [];
  const responsibilities = normalized.responsibilities || [];
  const embedding = await getJobDescriptionEmbedding(normalized);

  const jd = new JobDescriptionModel({
    userId,
    title: normalized.title || "Job",
    company: normalized.company || "",
    skills,
    niceToHave,
    requirements,
    responsibilities,
    context: context || "",
  });
  if (embedding) jd.embedding = embedding;
  await jd.save();

  return { jdId: jd._id.toString() };
}

function toPublicParsedJD(parsed) {
  return {
    title: parsed?.title || "",
    company: parsed?.company || "",
    skills: Array.isArray(parsed?.skills) ? parsed.skills : [],
    requirements: Array.isArray(parsed?.requirements) ? parsed.requirements : [],
    responsibilities: Array.isArray(parsed?.responsibilities) ? parsed.responsibilities : [],
  };
}

module.exports = {
  resolveJdContext,
  tryParseAndPersistJobDescription,
  tryFindTopResumesForJobDescription,
  tryFindTopProfilesForJobDescription,
  persistParsedJobDescription,
  toPublicParsedJD,
};
