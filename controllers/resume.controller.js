require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { ResumeModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { sendPdfResume, sendHtmlResume, sendDocResume, sendPdfFromHtml, sendDocFromHtml } = require("../utils/resumeUtils");
const { queueResumeEmbeddingRefresh } = require("../services/resumeEmbedding.service");

function isSameEmbeddingSource(a, b) {
  return JSON.stringify({
    summary: a?.summary ?? "",
    experiences: Array.isArray(a?.experiences) ? a.experiences : [],
    skills: Array.isArray(a?.skills) ? a.skills : [],
  }) === JSON.stringify({
    summary: b?.summary ?? "",
    experiences: Array.isArray(b?.experiences) ? b.experiences : [],
    skills: Array.isArray(b?.skills) ? b.skills : [],
  });
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
    experiences: Array.isArray(payload.experiences) ? payload.experiences : undefined,
    skills: Array.isArray(payload.skills) ? payload.skills : undefined,
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
  const data = mapPayloadToModel(payload, user._id);
  delete data.userId;

  if (!data.profileId) {
    return sendJsonResult(res, false, null, "A profile must be selected for the resume", 400);
  }

  const currentResume = await ResumeModel.findOne({ userId: user._id, _id: resumeId }).lean();
  if (!currentResume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }

  const nextEmbeddingSource = {
    summary: data.summary !== undefined ? data.summary : currentResume.summary,
    experiences: data.experiences !== undefined ? data.experiences : currentResume.experiences,
    skills: data.skills !== undefined ? data.skills : currentResume.skills,
  };
  const embeddingSourceChanged = !isSameEmbeddingSource(currentResume, nextEmbeddingSource);

  const updatedResume = await ResumeModel.findOneAndUpdate(
    { userId: user._id, _id: resumeId },
    { $set: data },
    { new: true }
  )
    .populate("profileId")
    .populate("templateId")
    .populate("stackId");

  if (!updatedResume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }

  if (embeddingSourceChanged) {
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

// Expose helper for tests
exports._mapPayloadToModel = mapPayloadToModel;
