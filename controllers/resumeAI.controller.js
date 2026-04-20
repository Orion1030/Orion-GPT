const crypto = require("crypto");
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
  tryFindTopProfilesForJobDescription,
  toPublicParsedJD,
} = require("../services/jdImport.service");
const { buildEmploymentKey, areEmploymentsEquivalent } = require("../utils/employmentKey");
const { alignResumeExperiencesToCareerHistory } = require("../utils/experienceAdapter");

function getRequestId(req, fallbackPrefix = "resume-generate") {
  const fromHeader = req.headers?.["x-request-id"];
  if (typeof fromHeader === "string" && fromHeader.trim()) return fromHeader.trim();
  return `${fallbackPrefix}-${crypto.randomUUID()}`;
}

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const first = forwarded.split(",")[0];
    if (first && first.trim()) return first.trim().slice(0, 120);
  }
  const realIp = req.headers?.["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim().slice(0, 120);
  return String(req.ip || req.socket?.remoteAddress || "").slice(0, 120);
}

function normalizeParsedEducation(education) {
  if (!Array.isArray(education)) return [];
  return education.map((item) => {
    if (typeof item === "string") {
      return {
        degreeLevel: "",
        universityName: item,
        major: "",
        startDate: "",
        endDate: "",
      };
    }
    return {
      degreeLevel: item?.degreeLevel || "",
      universityName: item?.universityName || "",
      major: item?.major || "",
      startDate: item?.startDate || "",
      endDate: item?.endDate || "",
    };
  });
}

function doesSelectedResumeMatchProfileCareerHistory(profile, baseResume) {
  const profileHistory = Array.isArray(profile?.careerHistory) ? profile.careerHistory : [];
  const resumeExperiences = Array.isArray(baseResume?.experiences) ? baseResume.experiences : [];

  if (profileHistory.length !== resumeExperiences.length) {
    return false;
  }

  // First consume strict exact-key matches to avoid over-using open-ended fallbacks.
  const remainingResume = [...resumeExperiences];
  const unmatchedProfile = [];
  for (const profileItem of profileHistory) {
    const exactProfileKey = buildEmploymentKey(profileItem);
    const exactMatchIndex = remainingResume.findIndex((resumeItem) => buildEmploymentKey(resumeItem) === exactProfileKey);
    if (exactMatchIndex >= 0) {
      remainingResume.splice(exactMatchIndex, 1);
      continue;
    }
    unmatchedProfile.push(profileItem);
  }

  for (const profileItem of unmatchedProfile) {
    const compatibleIndex = remainingResume.findIndex((resumeItem) =>
      areEmploymentsEquivalent(profileItem, resumeItem, { allowOpenEndDateMismatch: true })
    );
    if (compatibleIndex < 0) return false;
    remainingResume.splice(compatibleIndex, 1);
  }

  return remainingResume.length === 0;
}

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
  parsed.name = parsed.name || "Parsed Resume";
  parsed.summary = parsed.summary || "";
  parsed.experiences = Array.isArray(parsed.experiences) ? parsed.experiences : [];
  parsed.skills = Array.isArray(parsed.skills)
    ? parsed.skills
    : parsed.skills
      ? String(parsed.skills).split(/,|\\n/).map(s => s.trim()).filter(Boolean)
      : [];
  parsed.education = normalizeParsedEducation(parsed.education);

  const profiles = await ProfileModel.find({ userId: user._id });

  function normalizeName(n) {
    return String(n || "").toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
  }

  function splitFirstLast(name) {
    const parts = normalizeName(name).split(/\s+/).filter(Boolean);
    if (!parts.length) return { first: "", last: "" };
    return { first: parts[0] || "", last: parts[parts.length - 1] || "" };
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
  const parsedExps = Array.isArray(parsed.experiences) ? parsed.experiences : [];
  const parsedKeys = new Set(
    parsedExps.map((e) => `${normalizeCompany(e.companyName)}|${yearOf(e.startDate)}|${yearOf(e.endDate)}`)
  );

  // Step 2: Name match (first + last) inside current user's profiles.
  const parsedName = splitFirstLast(parsed.name);
  const hasParsedName = Boolean(parsedName.first && parsedName.last);
  const nameMatchedProfiles = hasParsedName
    ? profiles.filter((p) => {
      const profileName = splitFirstLast(p.fullName);
      return profileName.first === parsedName.first && profileName.last === parsedName.last;
    })
    : [];

  // Step 3: Career path match by company + period only.
  // If we found name matches, evaluate only those; otherwise evaluate all user profiles.
  const candidateProfiles = nameMatchedProfiles.length ? nameMatchedProfiles : profiles;
  const scoredMatches = candidateProfiles
    .map((p) => {
      const pExps = Array.isArray(p.careerHistory) ? p.careerHistory : [];
      const pKeys = new Set(
        pExps.map((e) => `${normalizeCompany(e.companyName)}|${yearOf(e.startDate)}|${yearOf(e.endDate)}`)
      );

      let overlap = 0;
      for (const k of parsedKeys) {
        if (pKeys.has(k)) overlap += 1;
      }

      const score = parsedKeys.size > 0 ? overlap / parsedKeys.size : 0;
      return { profile: p, score, overlap };
    })
    .filter((m) => m.overlap > 0)
    .sort((a, b) => b.score - a.score);

  if (!scoredMatches.length) {
    return sendJsonResult(res, true, { parsed, bestMatch: null, matches: [], createNewProfileSuggested: true });
  }

  const bestMatch = scoredMatches[0]
    ? {
      score: scoredMatches[0].score,
      profileId: scoredMatches[0].profile._id,
      profileSnapshot: scoredMatches[0].profile,
    }
    : null;
  const matches = scoredMatches.map((m) => m.profile);
  if (bestMatch?.profileSnapshot) {
    parsed.experiences = alignResumeExperiencesToCareerHistory(
      bestMatch.profileSnapshot.careerHistory,
      parsed.experiences
    );
  }

  return sendJsonResult(res, true, { parsed, bestMatch, matches, createNewProfileSuggested: false });
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
  const selectedBaseResumeId = typeof baseResumeId === "string" ? baseResumeId.trim() : "";
  if (selectedBaseResumeId) {
    baseResume = await ResumeModel.findOne({ _id: selectedBaseResumeId, userId, isDeleted: { $ne: true } }).populate("profileId").lean();
    if (!baseResume) {
      return sendJsonResult(res, false, null, "Selected resume not found", 404);
    }

    const resumeProfileId = baseResume?.profileId?._id
      ? String(baseResume.profileId._id)
      : baseResume?.profileId
        ? String(baseResume.profileId)
        : "";
    if (resumeProfileId && resumeProfileId !== String(profileId)) {
      return sendJsonResult(res, false, null, "Selected resume does not belong to the selected profile", 400);
    }

    if (!doesSelectedResumeMatchProfileCareerHistory(profile, baseResume)) {
      return sendJsonResult(
        res,
        false,
        null,
        "Selected resume experiences must match the selected profile career history (company, role, start date, end date).",
        400
      );
    }
  }

  const { result: genResult, error: genError } = await tryGenerateResumeJsonFromJD({
    jd,
    profile,
    baseResume,
    auditContext: {
      requestId: getRequestId(req, "resume-ai-generate"),
      source: "api.resume_ai",
      actorType: "user",
      actorUserId: req.user?._id || null,
      ip: getClientIp(req),
      userAgent: String(req.headers?.["user-agent"] || "").slice(0, 1000),
      trigger: "resume_ai.generate",
      jobDescriptionId: jd?._id ? String(jd._id) : String(jdId),
      profileId: profile?._id ? String(profile._id) : String(profileId),
      baseResumeId: baseResume?._id ? String(baseResume._id) : null,
    },
  });
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
 * Parse JD (no profileId required) + find top matching profiles in one call.
 * New JD-first wizard entry point. Body: { context }. Returns { jdId, parsed, topProfiles }.
 */
exports.parseJdAndMatchProfiles = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id;
  const jdContext = resolveJdContext(req.body);
  if (!jdContext || typeof jdContext !== "string" || !jdContext.trim()) {
    return sendJsonResult(res, false, null, "Context is required", 400);
  }
  if (jdContext.length > 100 * 1024) {
    return sendJsonResult(res, false, null, "Input too large", 413);
  }

  const { result: jdResult, error: jdError } = await tryParseAndPersistJobDescription({ userId, jdContext });
  if (jdError) {
    return sendJsonResult(res, false, null, jdError.message, jdError.statusCode || 500);
  }

  const { jdId, parsed } = jdResult;
  const { result: profilesResult, error: profilesError } = await tryFindTopProfilesForJobDescription({ userId, jdId });
  if (profilesError) {
    return sendJsonResult(res, false, null, profilesError.message, profilesError.statusCode || 500);
  }

  return sendJsonResult(res, true, {
    jdId,
    parsed: toPublicParsedJD(parsed),
    topProfiles: profilesResult.topProfiles,
  }, null, 200);
});

/**
 * Return the most recently used JD context for wizard prefill.
 * Body: none. Returns { lastUsedJd } where lastUsedJd may be null.
 */
exports.getLastUsedJd = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id;
  const latest = await JobDescriptionModel.findOne({
    userId,
    context: /\S/,
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("_id context title company updatedAt createdAt")
    .lean();

  if (!latest) {
    return sendJsonResult(res, true, { lastUsedJd: null }, null, 200);
  }

  return sendJsonResult(
    res,
    true,
    {
      lastUsedJd: {
        jdId: latest._id.toString(),
        context: latest.context || "",
        title: latest.title || "",
        company: latest.company || "",
        updatedAt: latest.updatedAt || latest.createdAt || null,
      },
    },
    null,
    200
  );
});

/**
 * Find top matching resumes for a given JD + selected profile (second step of the new wizard).
 * Body: { jdId, profileId }. Returns { topResumes }.
 */
exports.matchResumesForProfile = asyncErrorHandler(async (req, res) => {
  const userId = req.user._id;
  const { jdId, profileId } = req.body || {};
  if (!jdId || !profileId) {
    return sendJsonResult(res, false, null, "jdId and profileId are required", 400);
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
