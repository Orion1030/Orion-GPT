require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { ResumeModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { sendPdfResume, sendHtmlResume, sendDocResume, sendPdfFromHtml, sendDocFromHtml } = require("../utils/resumeUtils");
function mapPayloadToModel(payload, userId) {
  const profileId = payload.profile?.id ?? payload.profileId;
  const templateId = payload.template?.id ?? payload.templateId;
  const stackId = payload.stack?.id ?? payload.stackId;
  return {
    userId: userId,
    name: payload.name || 'Untitled Resume',
    profileId: profileId || null,
    stackId: stackId || null,
    templateId: templateId || null,
    note: payload.note ?? '',
    summary: payload.summary ?? '',
    content: {
      experienceStrings: payload.content?.experienceStrings ?? {},
      skillsContent: payload.content?.skillsContent ?? ''
    },
    pageFrameConfig: payload.pageFrameConfig ?? null,
  };
}

exports.createResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const payload = req.body.resume ?? req.body;
  const data = mapPayloadToModel(payload, user._id);

  if (!data.profileId) {
    return sendJsonResult(res, false, null, "A profile must be selected to create a resume", 400);
  }

  const newResume = new ResumeModel(data);
  await newResume.save();
  const populated = await ResumeModel.findById(newResume._id)
    .populate('profileId')
    .populate('templateId')
    .populate('stackId');
  return sendJsonResult(res, true, populated, "Resume created successfully", 201);
});
exports.getResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { resumeId } = req.params;
  const resume = await ResumeModel.findById(resumeId);
  if (!resume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }
  return sendJsonResult(res, true, resume);
});

exports.updateResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { resumeId } = req.params;
  const payload = req.body.resume ?? req.body;
  const data = mapPayloadToModel(payload, user._id);
  delete data.userId;

  if (!data.profileId) {
    return sendJsonResult(res, false, null, "A profile must be selected for the resume", 400);
  }

  const updatedResume = await ResumeModel.findOneAndUpdate(
    { userId: user._id, _id: resumeId },
    { $set: data },
    { new: true },
  )
    .populate('profileId')
    .populate('templateId')
    .populate('stackId');
  if (!updatedResume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }
  return sendJsonResult(res, true, updatedResume);
});

exports.deleteResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { resumeId } = req.params;
  const deletedResume = await ResumeModel.findOneAndDelete({ _id: resumeId, userId: user._id });
  if (!deletedResume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }
  return sendJsonResult(res, true, null, "Resume deleted successfully");
});

// TODO: parse the uploaded file to the resumeData object
// This is a placeholder for the actual file parsing logic
// You can use libraries like pdf-parse, docx-parser, etc. to extract text from the file
// For simplicity, we'll just use the file name as the note
// exports.uploadResume = asyncErrorHandler(async (req, res, next) => {
//   const { user } = req;
//   const { note } = req.body;
//   if (!req.file) {
//     return sendJsonResult(res, false, null, "No file uploaded", 400);
//   }
//   const resumeData = {
//     userId: user._id,
//     note,
//   };

//   const newResume = new ResumeModel(resumeData);
//   await newResume.save();
//   return sendJsonResult(res, true, newResume, "Resume uploaded successfully", 201);
// });

exports.clearResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  await ResumeModel.deleteMany({ userId: user._id });
  return sendJsonResult(res, true, null, "Resumes cleared successfully");
});

exports.getAllResumes = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const resumes = await ResumeModel.find({ userId: user._id })
    .populate('profileId')
    .populate('templateId')
    .populate('stackId')
    .sort({ updatedAt: -1 });
  return sendJsonResult(res, true, resumes);
});
exports.downloadResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { resumeId } = req.params;
  const { fileType } = req.query;

  const resume = await ResumeModel.findOne({ _id: resumeId, userId: user._id })
    .populate('templateId')
    .populate('profileId');
  if (!resume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }
  switch (fileType) {
    case 'pdf':
      return sendPdfResume(resume, res);
    case 'html':
      return sendHtmlResume(resume, res);
    case 'doc':
      return sendDocResume(resume, res);
    default:
      return sendJsonResult(res, false, null, "Invalid file type", 400);
  }
});

exports.downloadResumeFromHtml = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { resumeId } = req.params;
  const { fileType, html, name } = req.body;

  // Basic auth + ownership check: ensure resume exists for this user (keeps parity with GET)
  const resume = await ResumeModel.findOne({ _id: resumeId, userId: user._id })
    .populate('templateId')
    .populate('profileId');
  if (!resume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }

  if (!html || typeof html !== 'string') {
    return sendJsonResult(res, false, null, "Missing html payload", 400);
  }

  switch (fileType) {
    case 'pdf':
      return sendPdfFromHtml(html, res, { name });
    case 'doc':
      return sendDocFromHtml(html, res, { name });
    case 'html':
      res.set({
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${(name || 'resume').replace(/"/g, '')}.html"`,
      });
      return res.send(html);
    default:
      return sendJsonResult(res, false, null, "Invalid file type", 400);
  }
});