require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { ResumeModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { sendPdfResume, sendHtmlResume, sendDocResume, sendPdfFromHtml, sendDocFromHtml } = require("../utils/resumeUtils");
const { queueResumeEmbeddingRefresh } = require("../services/resumeEmbedding.service");

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

function normalizeExperiences(experiences) {
  if (!Array.isArray(experiences)) return [];
  return experiences.map((e) => ({
    title: toCleanString(e?.title ?? e?.roleTitle),
    companyName: toCleanString(e?.companyName),
    companyLocation: toCleanString(e?.companyLocation),
    summary: toCleanString(e?.summary ?? e?.companySummary),
    descriptions: Array.isArray(e?.descriptions)
      ? e.descriptions.map(toCleanString).filter(Boolean)
      : Array.isArray(e?.keyPoints)
        ? e.keyPoints.map(toCleanString).filter(Boolean)
        : [],
    startDate: toCleanString(e?.startDate),
    endDate: toCleanString(e?.endDate),
  }));
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

/** $set fields present on the payload only (PATCH-style updates). */
function mapUpdatePayloadToSet(payload) {
  if (!payload || typeof payload !== "object") return {};
  const set = {};
  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const n = payload.name;
    set.name = n != null && String(n).trim() !== "" ? n : "Untitled Resume";
  }
  if ("profile" in payload || "profileId" in payload) {
    const profileId = payload.profile?.id ?? payload.profileId;
    set.profileId = profileId || null;
  }
  if ("template" in payload || "templateId" in payload) {
    set.templateId = payload.template?.id ?? payload.templateId ?? null;
  }
  if ("stack" in payload || "stackId" in payload) {
    set.stackId = payload.stack?.id ?? payload.stackId ?? null;
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
  const profileId = payload.profile?.id ?? payload.profileId;
  const templateId = payload.template?.id ?? payload.templateId;
  const stackId = payload.stack?.id ?? payload.stackId;
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

exports.createResume = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const payload = req.body.resume ?? req.body;
  const data = mapPayloadToModel(payload, user._id);

  if (!data.profileId) {
    return sendJsonResult(res, false, null, "A profile must be selected to create a resume", 400);
  }

  const newResume = new ResumeModel(data);
  await newResume.save();
  queueResumeEmbeddingRefresh(newResume._id, { maxAttempts: 3 });
  const populated = await ResumeModel.findById(newResume._id)
    .populate("profileId")
    .populate("templateId")
    .populate("stackId");
  return sendJsonResult(res, true, populated, "Resume created successfully", 201);
});

exports.getResume = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { resumeId } = req.params;

  const resumeDoc = await ResumeModel.findOne({ _id: resumeId, userId: user._id })
    .populate("profileId")
    .populate("templateId")
    .populate("stackId")
    .lean();

  if (!resumeDoc) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }

  return sendJsonResult(res, true, { ...resumeDoc, id: String(resumeDoc._id) });
});

exports.getResumeByProfileAndId = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { profileId, resumeId } = req.params;

  const resumeDoc = await ResumeModel.findOne({ _id: resumeId, userId: user._id, profileId })
    .populate("profileId")
    .populate("templateId")
    .populate("stackId")
    .lean();

  if (!resumeDoc) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }

  return sendJsonResult(res, true, { ...resumeDoc, id: String(resumeDoc._id) });
});

exports.updateResume = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { resumeId } = req.params;
  const payload = req.body.resume ?? req.body;

  const currentResume = await ResumeModel.findOne({ userId: user._id, _id: resumeId }).lean();
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

  const shouldRefreshEmbedding = payloadTouchesEmbeddingFields(payload);

  if (Object.keys(setDoc).length === 0) {
    const populated = await ResumeModel.findById(resumeId)
      .populate("profileId")
      .populate("templateId")
      .populate("stackId");
    return sendJsonResult(res, true, populated);
  }

  const updatedResume = await ResumeModel.findOneAndUpdate(
    { userId: user._id, _id: resumeId },
    { $set: setDoc },
    { new: true }
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
  return sendJsonResult(res, true, withEmbedding || updatedResume);
});

exports.deleteResume = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { resumeId } = req.params;
  const deleted = await ResumeModel.findOneAndDelete({ _id: resumeId, userId: user._id });
  if (!deleted) return sendJsonResult(res, false, null, "Resume not found", 404);
  return sendJsonResult(res, true, null, "Resume deleted successfully");
});

exports.clearResume = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  await ResumeModel.deleteMany({ userId: user._id });
  return sendJsonResult(res, true, null, "Resumes cleared successfully");
});

exports.getAllResumes = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const resumes = await ResumeModel.find({ userId: user._id })
    .populate("profileId")
    .populate("templateId")
    .populate("stackId")
    .sort({ updatedAt: -1 });
  return sendJsonResult(res, true, resumes);
});

exports.downloadResume = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { resumeId } = req.params;
  const { fileType } = req.query;

  const resume = await ResumeModel.findOne({ _id: resumeId, userId: user._id })
    .populate("templateId")
    .populate("profileId");
  if (!resume) return sendJsonResult(res, false, null, "Resume not found", 404);

  switch (fileType) {
    case "pdf": return sendPdfResume(resume, res);
    case "html": return sendHtmlResume(resume, res);
    case "doc": return sendDocResume(resume, res);
    default: return sendJsonResult(res, false, null, "Invalid file type", 400);
  }
});

exports.downloadResumeFromHtml = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { resumeId } = req.params;
  const { fileType, html, name } = req.body;

  const resume = await ResumeModel.findOne({ _id: resumeId, userId: user._id })
    .populate("templateId")
    .populate("profileId");
  if (!resume) return sendJsonResult(res, false, null, "Resume not found", 404);

  if (!html || typeof html !== "string") {
    return sendJsonResult(res, false, null, "Missing html payload", 400);
  }

  switch (fileType) {
    case "pdf": return sendPdfFromHtml(html, res, { name });
    case "doc": return sendDocFromHtml(html, res, { name });
    case "html":
      res.set({
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="${(name || "resume").replace(/"/g, "")}.html"`,
      });
      return res.send(html);
    default:
      return sendJsonResult(res, false, null, "Invalid file type", 400);
  }
});

// Expose helpers for tests
exports._mapPayloadToModel = mapPayloadToModel;
exports._mapUpdatePayloadToSet = mapUpdatePayloadToSet;
