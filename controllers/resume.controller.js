const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { ResumeModel, ProfileModel, ApplicationModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const {
  sendPdfResume,
  sendHtmlResume,
  sendDocResume,
  sendPdfFromHtml,
  sendDocFromHtml,
  injectHtmlDownloadMetadata,
  getConfig,
  getMargins,
} = require("../utils/resumeUtils");
const { queueResumeEmbeddingRefresh } = require("../services/resumeEmbedding.service");
const { appendApplicationHistory } = require("../services/applicationHistory.service");
const { alignResumeExperiencesToCareerHistory } = require("../utils/experienceAdapter");
const { isAdminUser, buildUserScopeFilter } = require("../utils/access");
const { RoleLevels } = require("../utils/constants");
const { buildReadableProfileFilterForUser } = require("../services/profileAccess.service");

function toTargetUserId(req) {
  const fromQuery = req.query?.userId;
  if (typeof fromQuery === "string" && fromQuery.trim()) return fromQuery.trim();
  const fromBody = req.body?.userId;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  const fromResumeBody = req.body?.resume?.userId;
  if (typeof fromResumeBody === "string" && fromResumeBody.trim()) return fromResumeBody.trim();
  return null;
}

function buildResumeScope(req) {
  const targetUserId = isAdminUser(req.user) ? toTargetUserId(req) : null;
  return buildUserScopeFilter(req.user, targetUserId);
}

function toCleanString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function parseJsonLike(value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;
  const looksJson = (text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"));
  if (!looksJson) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function flattenArrayOneLevel(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (Array.isArray(item)) out.push(...item);
    else out.push(item);
  }
  return out;
}

function normalizeLegacyBulletList(value) {
  if (Array.isArray(value)) {
    return value.map(toCleanString).filter(Boolean);
  }
  if (typeof value !== "string") return [];

  const raw = value.trim();
  if (!raw) return [];

  const htmlListItems = [...raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => toCleanString(match[1]))
    .filter(Boolean);
  if (htmlListItems.length) return htmlListItems;

  const lines = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-*•]+/, ""))
    .map((line) => toCleanString(line.replace(/<[^>]+>/g, " ")))
    .filter(Boolean);
  if (lines.length) return lines;

  const single = toCleanString(raw.replace(/<[^>]+>/g, " "));
  return single ? [single] : [];
}

function readExperienceBullets(e) {
  if (Array.isArray(e?.bullets)) return e.bullets.map(toCleanString).filter(Boolean);
  if (typeof e?.bullets === "string") return normalizeLegacyBulletList(e.bullets);
  if (Array.isArray(e?.descriptions)) return e.descriptions.map(toCleanString).filter(Boolean);
  if (typeof e?.descriptions === "string") return normalizeLegacyBulletList(e.descriptions);
  if (Array.isArray(e?.keyPoints)) return e.keyPoints.map(toCleanString).filter(Boolean);
  return normalizeLegacyBulletList(e?.keyPoints);
}

function normalizeExperiences(experiences) {
  if (!Array.isArray(experiences)) return [];
  return experiences.map((e) => {
    const legacySummary = toCleanString(e?.summary ?? e?.companySummary);
    const bullets = readExperienceBullets(e);
    const mergedBullets = [...new Set([legacySummary, ...bullets].filter(Boolean))];

    return {
      title: toCleanString(e?.title ?? e?.roleTitle),
      companyName: toCleanString(e?.companyName),
      companyLocation: toCleanString(e?.companyLocation),
      bullets: mergedBullets,
      startDate: toCleanString(e?.startDate),
      endDate: toCleanString(e?.endDate),
    };
  });
}

function normalizeResumeForResponse(resume) {
  if (!resume) return resume;
  const plain = typeof resume.toObject === "function" ? resume.toObject() : { ...resume };
  return {
    ...plain,
    id: plain._id ? String(plain._id) : plain.id,
    experiences: normalizeExperiences(plain.experiences),
  };
}

function normalizeSkills(skills) {
  if (!Array.isArray(skills)) return [];

  const normalized = [];
  for (const section of skills) {
    if (!section || typeof section !== "object") continue;
    const sectionTitle = toCleanString(section.title) || "Skills";
    const parsedItems = parseJsonLike(section.items);
    const sectionItems = flattenArrayOneLevel(Array.isArray(parsedItems) ? parsedItems : []);

    // Compatibility: UI may send nested grouped skills:
    // [{ title: "Skills", items: [{ title: "Data Pipeline", items: ["AWS Glue"] }] }]
    const nestedGroups = sectionItems
      .map((item) => parseJsonLike(item))
      .filter((item) => item && typeof item === "object" && !Array.isArray(item))
      .map((item) => {
        const parsedGroupItems = parseJsonLike(item.items);
        const groupItems = flattenArrayOneLevel(Array.isArray(parsedGroupItems) ? parsedGroupItems : [])
          .map(toCleanString)
          .filter(Boolean);
        return { title: toCleanString(item.title), items: groupItems };
      })
      .filter((group) => group.items.length > 0);

    if (nestedGroups.length > 0) {
      for (const group of nestedGroups) {
        const groupTitle = toCleanString(group.title) || sectionTitle;
        const groupItems = group.items;
        if (groupItems.length) normalized.push({ title: groupTitle, items: groupItems });
      }
      continue;
    }

    const flatItems = sectionItems.map(toCleanString).filter(Boolean);
    if (flatItems.length) normalized.push({ title: sectionTitle, items: flatItems });
  }

  return normalized;
}

function normalizeEducation(education) {
  if (!Array.isArray(education)) return [];

  return education
    .map((e) => {
      if (typeof e === "string") {
        return {
          degreeLevel: "",
          universityName: toCleanString(e),
          major: "",
          startDate: "",
          endDate: "",
        };
      }

      return {
        degreeLevel: toCleanString(e?.degreeLevel),
        universityName: toCleanString(e?.universityName),
        major: toCleanString(e?.major),
        startDate: toCleanString(e?.startDate),
        endDate: toCleanString(e?.endDate),
      };
    })
    .filter((e) => e.universityName || e.degreeLevel || e.major || e.startDate || e.endDate);
}

function extractVisibleTextFromHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function appendDownloadHistoryEvent({
  userId,
  actorId,
  applicationId,
  resumeId,
  fileType,
}) {
  if (!applicationId) return;
  const appQuery = { _id: applicationId };
  if (userId) appQuery.userId = userId;

  const app = await ApplicationModel.findOne(appQuery)
    .select("_id resumeId userId")
    .lean();
  if (!app) return;

  if (app.resumeId && String(app.resumeId) !== String(resumeId)) {
    return;
  }

  const normalizedFileType = fileType === "pdf" ? "pdf" : "docx";
  await appendApplicationHistory({
    applicationId: app._id,
    userId: app.userId || userId || null,
    eventType: normalizedFileType === "pdf" ? "download_pdf" : "download_docx",
    actorType: "user",
    actorId: actorId || userId || null,
    payload: {
      resumeId: String(resumeId),
      fileType: normalizedFileType,
    },
    requestId: `download-${String(app._id)}-${normalizedFileType}-${Date.now()}`,
    source: "api",
  }).catch(() => {});
}

/** $set fields present on the payload only (PATCH-style updates). */
function mapUpdatePayloadToSet(payload) {
  if (!payload || typeof payload !== "object") return {};
  const set = {};
  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const n = payload.name;
    set.name = n != null && String(n).trim() !== "" ? n : "Untitled Resume";
  }
  if ("profile" in payload || "profileId" in payload) {
    // Guard: only update profile when a concrete id is provided.
    // If profile/profileId key exists but id is missing/empty, preserve current profile linkage.
    const profileId = toCleanString(payload.profile?.id ?? payload.profile?._id ?? payload.profileId);
    if (profileId) set.profileId = profileId;
  }
  if ("template" in payload || "templateId" in payload) {
    const templateId = toCleanString(payload.template?.id ?? payload.template?._id ?? payload.templateId);
    if (templateId) set.templateId = templateId;
  }
  if ("stack" in payload || "stackId" in payload) {
    const stackId = toCleanString(payload.stack?.id ?? payload.stack?._id ?? payload.stackId);
    set.stackId = stackId || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "note")) {
    set.note = payload.note ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "summary")) {
    set.summary = payload.summary ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "experiences")) {
    set.experiences = normalizeExperiences(payload.experiences);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "skills")) {
    set.skills = normalizeSkills(payload.skills);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "education")) {
    set.education = normalizeEducation(payload.education);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "pageFrameConfig")) {
    set.pageFrameConfig = payload.pageFrameConfig ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "cloudPrimary")) {
    set.cloudPrimary = payload.cloudPrimary ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "cloudSecondary")) {
    set.cloudSecondary = Array.isArray(payload.cloudSecondary) ? payload.cloudSecondary : [];
  }
  return set;
}

function payloadTouchesEmbeddingFields(payload) {
  if (!payload || typeof payload !== "object") return false;
  return (
    Object.prototype.hasOwnProperty.call(payload, "summary") ||
    Object.prototype.hasOwnProperty.call(payload, "experiences") ||
    Object.prototype.hasOwnProperty.call(payload, "skills") ||
    Object.prototype.hasOwnProperty.call(payload, "education")
  );
}

function mapPayloadToModel(payload, userId) {
  const profileId = payload.profile?.id ?? payload.profile?._id ?? payload.profileId;
  const templateId = payload.template?.id ?? payload.template?._id ?? payload.templateId;
  const stackId = payload.stack?.id ?? payload.stack?._id ?? payload.stackId;
  return {
    userId,
    name: payload.name || "Untitled Resume",
    profileId: profileId || null,
    stackId: stackId || null,
    templateId: templateId || null,
    note: payload.note ?? "",
    summary: payload.summary ?? "",
    experiences: Array.isArray(payload.experiences) ? normalizeExperiences(payload.experiences) : undefined,
    skills: Array.isArray(payload.skills) ? normalizeSkills(payload.skills) : undefined,
    education: Array.isArray(payload.education) ? normalizeEducation(payload.education) : undefined,
    pageFrameConfig: payload.pageFrameConfig ?? null,
    cloudPrimary: payload.cloudPrimary ?? (payload.cloudPrimary === "" ? "" : undefined),
    cloudSecondary: Array.isArray(payload.cloudSecondary) ? payload.cloudSecondary : undefined,
  };
}

function isImportResumePayload(payload) {
  const source = toCleanString(payload?.source).toLowerCase();
  return source === "import";
}

exports.createResume = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const payload = req.body.resume ?? req.body;
  const targetUserId = isAdminUser(user) ? toTargetUserId(req) : null;
  const data = mapPayloadToModel(payload, targetUserId || user._id);

  if (!data.profileId) {
    return sendJsonResult(res, false, null, "A profile must be selected to create a resume", 400);
  }

  const profileFilter = isAdminUser(user)
    ? targetUserId
      ? await buildReadableProfileFilterForUser(targetUserId, {
          _id: data.profileId,
        })
      : { _id: data.profileId }
    : await buildReadableProfileFilterForUser(
        user._id,
        { _id: data.profileId },
        { isGuest: Number(user?.role) === RoleLevels.GUEST }
      );

  const profile = await ProfileModel.findOne(profileFilter)
    .select("userId careerHistory stackId")
    .lean();
  if (!profile) {
    return sendJsonResult(res, false, null, "Profile not found", 404);
  }

  if (isAdminUser(user)) {
    if (targetUserId && String(profile.userId) !== String(targetUserId)) {
      return sendJsonResult(res, false, null, "Selected profile does not belong to the target user", 400);
    }
    data.userId = targetUserId || profile.userId;
  } else {
    data.userId = user._id;
  }

  if (isImportResumePayload(payload)) {
    data.experiences = alignResumeExperiencesToCareerHistory(profile.careerHistory, data.experiences);
  }
  if (!data.stackId) {
    data.stackId = profile.stackId || null;
  }

  const newResume = new ResumeModel(data);
  await newResume.save();
  queueResumeEmbeddingRefresh(newResume._id, { maxAttempts: 3 });
  const populated = await ResumeModel.findById(newResume._id)
    .populate("profileId")
    .populate("templateId")
    .populate("stackId");
  return sendJsonResult(res, true, normalizeResumeForResponse(populated), "Resume created successfully", 201);
});

exports.getResume = asyncErrorHandler(async (req, res) => {
  const { resumeId } = req.params;
  const scope = buildResumeScope(req);

  const resumeDoc = await ResumeModel.findOne({ ...scope, _id: resumeId, isDeleted: { $ne: true } })
    .populate("profileId")
    .populate("templateId")
    .populate("stackId")
    .lean();

  if (!resumeDoc) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }

  return sendJsonResult(res, true, normalizeResumeForResponse(resumeDoc));
});

exports.getResumeByProfileAndId = asyncErrorHandler(async (req, res) => {
  const { profileId, resumeId } = req.params;
  const scope = buildResumeScope(req);

  const resumeDoc = await ResumeModel.findOne({ ...scope, _id: resumeId, profileId, isDeleted: { $ne: true } })
    .populate("profileId")
    .populate("templateId")
    .populate("stackId")
    .lean();

  if (!resumeDoc) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }

  return sendJsonResult(res, true, normalizeResumeForResponse(resumeDoc));
});

exports.updateResume = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { resumeId } = req.params;
  const payload = req.body.resume ?? req.body;
  const scope = buildResumeScope(req);

  const currentResume = await ResumeModel.findOne({ ...scope, _id: resumeId, isDeleted: { $ne: true } }).lean();
  if (!currentResume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }

  const setDoc = mapUpdatePayloadToSet(payload);
  delete setDoc.id;
  delete setDoc._id;

  const effectiveProfileId =
    setDoc.profileId !== undefined ? setDoc.profileId : currentResume.profileId;
  if (!effectiveProfileId) {
    return sendJsonResult(res, false, null, "A profile must be selected for the resume", 400);
  }

  const targetUserId = isAdminUser(user) ? toTargetUserId(req) : null;
  const profileFilter = isAdminUser(user)
    ? targetUserId
      ? await buildReadableProfileFilterForUser(targetUserId, {
          _id: effectiveProfileId,
        })
      : { _id: effectiveProfileId }
    : await buildReadableProfileFilterForUser(
        user._id,
        { _id: effectiveProfileId },
        { isGuest: Number(user?.role) === RoleLevels.GUEST }
      );
  const profile = await ProfileModel.findOne(profileFilter).select("_id userId stackId").lean();
  if (!profile) {
    return sendJsonResult(res, false, null, "Profile not found", 404);
  }

  if (isAdminUser(user)) {
    setDoc.userId = targetUserId || profile.userId;
  }
  if (setDoc.stackId === undefined) {
    setDoc.stackId = profile.stackId || null;
  }

  const shouldRefreshEmbedding = payloadTouchesEmbeddingFields(payload);

  if (Object.keys(setDoc).length === 0) {
    const populated = await ResumeModel.findById(resumeId)
      .populate("profileId")
      .populate("templateId")
      .populate("stackId");
    return sendJsonResult(res, true, normalizeResumeForResponse(populated));
  }

  const updatedResume = await ResumeModel.findOneAndUpdate(
    { ...scope, _id: resumeId, isDeleted: { $ne: true } },
    { $set: setDoc },
    { returnDocument: "after" }
  )
    .populate("profileId")
    .populate("templateId")
    .populate("stackId");

  if (!updatedResume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }

  if (shouldRefreshEmbedding) {
    queueResumeEmbeddingRefresh(resumeId, { maxAttempts: 3 });
  }
  const withEmbedding = await ResumeModel.findById(resumeId)
    .populate("profileId")
    .populate("templateId")
    .populate("stackId");
  return sendJsonResult(res, true, normalizeResumeForResponse(withEmbedding || updatedResume));
});

exports.deleteResume = asyncErrorHandler(async (req, res) => {
  const { resumeId } = req.params;
  const scope = buildResumeScope(req);
  const update = await ResumeModel.updateOne(
    { ...scope, _id: resumeId },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id } }
  );
  if (!update.matchedCount) return sendJsonResult(res, false, null, "Resume not found", 404);
  return sendJsonResult(res, true, null, "Resume deleted successfully");
});

exports.clearResume = asyncErrorHandler(async (req, res) => {
  const scope = buildResumeScope(req);
  const result = await ResumeModel.updateMany(
    scope,
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id } }
  );
  return sendJsonResult(res, true, { modifiedCount: result.modifiedCount }, "Resumes cleared successfully");
});

exports.deleteResumes = asyncErrorHandler(async (req, res) => {
  const scope = buildResumeScope(req);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];

  // If no ids provided, fall back to clear-all (soft delete) to preserve previous behavior
  if (ids.length === 0) {
    if (isAdminUser(req.user) && !toTargetUserId(req)) {
      return sendJsonResult(res, false, null, "Admin bulk delete requires explicit ids or userId scope", 400);
    }
    const result = await ResumeModel.updateMany(
      scope,
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id } }
    );
    return sendJsonResult(res, true, { modifiedCount: result.modifiedCount }, "Resumes deleted successfully");
  }

  const result = await ResumeModel.updateMany(
    { ...scope, _id: { $in: ids } },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id } }
  );

  if (result.matchedCount === 0) {
    return sendJsonResult(res, false, null, "No matching resumes found", 404);
  }

  return sendJsonResult(
    res,
    true,
    { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount },
    "Resumes deleted successfully"
  );
});

exports.getAllResumes = asyncErrorHandler(async (req, res) => {
  const scope = buildResumeScope(req);
  const resumes = await ResumeModel.find({ ...scope, isDeleted: { $ne: true } })
    .populate("profileId")
    .populate("templateId")
    .populate("stackId")
    .sort({ updatedAt: -1 });
  return sendJsonResult(res, true, resumes.map(normalizeResumeForResponse));
});

exports.downloadResume = asyncErrorHandler(async (req, res) => {
  const { resumeId } = req.params;
  const { fileType, applicationId } = req.query;
  const scope = buildResumeScope(req);

  const resume = await ResumeModel.findOne({ ...scope, _id: resumeId, isDeleted: { $ne: true } })
    .populate("templateId")
    .populate("profileId");
  if (!resume) return sendJsonResult(res, false, null, "Resume not found", 404);

  switch (fileType) {
    case "pdf":
      await appendDownloadHistoryEvent({
        userId: resume.userId ? String(resume.userId) : null,
        actorId: req.user._id,
        applicationId,
        resumeId,
        fileType: "pdf",
      });
      return sendPdfResume(resume, res);
    case "html": return sendHtmlResume(resume, res);
    case "docx":
    case "doc":
      await appendDownloadHistoryEvent({
        userId: resume.userId ? String(resume.userId) : null,
        actorId: req.user._id,
        applicationId,
        resumeId,
        fileType: "docx",
      });
      return sendDocResume(resume, res);
    default: return sendJsonResult(res, false, null, "Invalid file type", 400);
  }
});

exports.downloadResumeFromHtml = asyncErrorHandler(async (req, res) => {
  const { resumeId } = req.params;
  const { fileType, html, name, preInlined, applicationId } = req.body;
  const scope = buildResumeScope(req);

  const resume = await ResumeModel.findOne({ ...scope, _id: resumeId, isDeleted: { $ne: true } })
    .populate("templateId")
    .populate("profileId");
  if (!resume) return sendJsonResult(res, false, null, "Resume not found", 404);

  if (!html || typeof html !== "string") {
    return sendJsonResult(res, false, null, "Missing html payload", 400);
  }

  const effectiveMargin = getMargins(getConfig(resume));

  switch (fileType) {
    case "pdf":
      await appendDownloadHistoryEvent({
        userId: resume.userId ? String(resume.userId) : null,
        actorId: req.user._id,
        applicationId,
        resumeId,
        fileType: "pdf",
      });
      return sendPdfFromHtml(html, res, {
        name,
        fullName: resume.profileId?.fullName || "",
        margin: effectiveMargin,
      });
    case "docx":
    case "doc": {
      await appendDownloadHistoryEvent({
        userId: resume.userId ? String(resume.userId) : null,
        actorId: req.user._id,
        applicationId,
        resumeId,
        fileType: "docx",
      });
      const htmlText = extractVisibleTextFromHtml(html);
      if (!htmlText) {
        return sendDocResume(resume, res);
      }
      return sendDocFromHtml(html, res, {
        name,
        fullName: resume.profileId?.fullName || "",
        margin: effectiveMargin,
        preInlined: !!preInlined,
      });
    }
    case "html": {
      const fullName = resume.profileId?.fullName || "";
      const htmlWithMeta = typeof injectHtmlDownloadMetadata === "function"
        ? injectHtmlDownloadMetadata(html, fullName)
        : html;
      res.set({
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="${(name || "resume").replace(/"/g, "")}.html"`,
      });
      return res.send(htmlWithMeta);
    }
    default:
      return sendJsonResult(res, false, null, "Invalid file type", 400);
  }
});

// Expose helpers for tests
exports._mapPayloadToModel = mapPayloadToModel;
exports._mapUpdatePayloadToSet = mapUpdatePayloadToSet;
