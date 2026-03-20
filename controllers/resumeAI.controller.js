require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { JobDescriptionModel, ResumeModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { ProfileModel } = require("../dbModels");
const { tryGenerateResumeJsonFromJD } = require("../utils/resumeGeneration");
const { tryRefineResumeWithFeedback } = require("../services/llm/resumeRefine.service");
const { tryParseResumeTextWithLLM } = require("../utils/parseResume");
const {
  resolveJdContext,
  tryParseAndPersistJobDescription,
  tryFindTopResumesForJobDescription,
  toPublicParsedJD,
} = require("../services/jdImport.service");

/** Parse plain text resume using server-side LLM and suggest matching profile. */
exports.parseTextResume = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { text } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    return sendJsonResult(res, false, null, "Missing text payload", 400);
  }
  if (text.length > 200 * 1024) {
    return sendJsonResult(res, false, null, "Input too large. Please trim the file.", 413);
  }

  const { result: parseResult, error: parseError } = await tryParseResumeTextWithLLM(text);
  if (parseError) {
    return sendJsonResult(res, false, null, parseError.message, parseError.statusCode || 500);
  }

  let parsed = parseResult.parsed || {};
  parsed.profile = parsed.profile || {};
  parsed.summary = parsed.summary || "";
  parsed.skills = Array.isArray(parsed.skills)
    ? parsed.skills
    : parsed.skills
      ? String(parsed.skills).split(/,|\\n/).map(s => s.trim()).filter(Boolean)
      : [];
  parsed.meta = parsed.meta || { confidence: 0, missingFields: [] };

  const profiles = await ProfileModel.find({ userId: user._id });

  function normalizeName(n) {
    return String(n || "").toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
  }

  const yearOf = (d) => {
    if (!d) return "";
    try {
      const dt = new Date(d);
      if (!isNaN(dt.getTime())) return dt.getUTCFullYear().toString();
    } catch { }
    const m = String(d).match(/(\d{4})/);
    const yearString = m ? m[1] : String(d || "").trim();
    return yearString.toLowerCase() === "present" ? new Date().getFullYear().toString() : yearString;
  };

  const normalizeCompany = (s) => normalizeName(String(s || ""));
  const parsedExps = Array.isArray(parsed.profile?.experiences) ? parsed.profile.experiences : [];
  const parsedKeys = new Set(
    parsedExps.map((e) => `${normalizeCompany(e.companyName)}|${yearOf(e.startDate)}|${yearOf(e.endDate)}`)
  );

  const strictMatches = [];
  for (const p of profiles) {
    const pExps = Array.isArray(p.experiences) ? p.experiences : [];
    if (pExps.length !== parsedExps.length) continue;
    const pKeys = new Set(
      pExps.map((e) => `${normalizeCompany(e.companyName)}|${yearOf(e.startDate)}|${yearOf(e.endDate)}`)
    );
    if (pKeys.size !== parsedKeys.size) continue;
    let allPresent = true;
    for (const k of parsedKeys) {
      if (!pKeys.has(k)) { allPresent = false; break; }
    }
    if (allPresent) strictMatches.push(p);
  }

  if (!strictMatches.length) {
    return sendJsonResult(res, true, { parsed, bestMatch: null, matches: [], createNewProfileSuggested: true });
  }

  const incomingEmail = (parsed.profile?.contactInfo?.email || "").trim().toLowerCase();
  const incomingName = (parsed.profile?.fullName || "").trim().toLowerCase();
  let best = { score: 0, profileId: null, profileSnapshot: null };
  for (const m of strictMatches) {
    let score = 0;
    if (incomingEmail && m.contactInfo && (m.contactInfo.email || "").trim().toLowerCase() === incomingEmail) {
      score = 1.0;
    }
    if (!score && incomingName && (m.fullName || "").trim().toLowerCase() === incomingName) {
      score = 0.95;
    }
    if (score > best.score) best = { score, profileId: m._id, profileSnapshot: m };
  }

  return sendJsonResult(res, true, { parsed, bestMatch: best.profileId ? best : null, matches: strictMatches, createNewProfileSuggested: false });
});

/** Generate resume from JD + profile (LLM -> normalized JSON). */
exports.generateResumeFromJD = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id;
  const { jdId, profileId, baseResumeId } = req.body || {};
  if (!jdId || !profileId) {
    return sendJsonResult(res, false, null, "jdId and profileId are required", 400);
  }

  const jd = await JobDescriptionModel.findOne({ _id: jdId, userId }).lean();
  const profile = await ProfileModel.findOne({ _id: profileId, userId }).lean();
  if (!jd || !profile) {
    return sendJsonResult(res, false, null, "JD or profile not found", 404);
  }

  let baseResume = null;
  if (baseResumeId) {
    baseResume = await ResumeModel.findOne({ _id: baseResumeId, userId }).populate("profileId").lean();
  }

  const { result: genResult, error: genError } = await tryGenerateResumeJsonFromJD({ jd, profile, baseResume });
  if (genError) {
    return sendJsonResult(res, false, null, genError.message, genError.statusCode || 500);
  }
  return sendJsonResult(res, true, { resume: genResult.resume }, null, 200);
});

/** Refine resume with user feedback (delta editor). */
exports.refineResume = asyncErrorHandler(async (req, res) => {
  const { resumeContent, feedback } = req.body || {};
  if (!resumeContent || !feedback || typeof feedback !== "string") {
    return sendJsonResult(res, false, null, "resumeContent and feedback are required", 400);
  }

  const { result: refineResult, error: refineError } = await tryRefineResumeWithFeedback({ resumeContent, feedback });
  if (refineError) {
    return sendJsonResult(res, true, { content: resumeContent }, null, 200);
  }
  return sendJsonResult(res, true, { content: refineResult.content }, null, 200);
});

/** Find top resumes for a JD and profile. */
exports.findTopResumes = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id;
  const { jdId, profileId } = req.body || {};
  if (!jdId) {
    return sendJsonResult(res, false, null, "jdId is required", 400);
  }

  const { result, error } = await tryFindTopResumesForJobDescription({ userId, jdId, profileId });
  if (error) {
    return sendJsonResult(res, false, null, error.message, error.statusCode || 500);
  }
  return sendJsonResult(res, true, { topResumes: result.topResumes }, null, 200);
});

/**
 * Import JD (parse + store with embedding) and find top matching resumes in one call.
 * Body: { profileId, context }. Returns { jdId, parsed, topResumes }.
 */
exports.importJdAndMatch = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id;
  const { profileId } = req.body || {};
  const jdContext = resolveJdContext(req.body);
  if (!jdContext || typeof jdContext !== "string" || !jdContext.trim()) {
    return sendJsonResult(res, false, null, "Context is required", 400);
  }
  if (!profileId) {
    return sendJsonResult(res, false, null, "profileId is required", 400);
  }
  if (jdContext.length > 100 * 1024) {
    return sendJsonResult(res, false, null, "Input too large", 413);
  }

  const { result: jdResult, error: jdError } = await tryParseAndPersistJobDescription({ userId, jdContext });
  if (jdError) {
    return sendJsonResult(res, false, null, jdError.message, jdError.statusCode || 500);
  }

  const { jdId, parsed } = jdResult;
  const { result: topResult, error: topError } = await tryFindTopResumesForJobDescription({ userId, jdId, profileId });
  if (topError) {
    return sendJsonResult(res, false, null, topError.message, topError.statusCode || 500);
  }

  return sendJsonResult(res, true, { jdId, parsed: toPublicParsedJD(parsed), topResumes: topResult.topResumes }, null, 200);
});
