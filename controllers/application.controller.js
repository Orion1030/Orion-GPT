require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { ApplicationModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");

exports.getAllApplications = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const applications = await ApplicationModel.find({ userId: user._id }).sort({ createdAt: -1 });
  return sendJsonResult(res, true, applications ?? []);
});

exports.getApplicationsByProfileId = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { profileId } = req.params;
  const applications = await ApplicationModel.find({ userId: user._id, stackId: profileId }).sort({ createdAt: -1 });
  return sendJsonResult(res, true, applications ?? []);
});

exports.createApplication = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { companyName, jobTitle, jobUrl, platform, resumeId, status, note, skillMatchPercent } = req.body;

  if (!companyName || !jobTitle) {
    return sendJsonResult(res, false, null, 'companyName and jobTitle are required', 400);
  }

  const application = new ApplicationModel({
    userId: user._id,
    companyName,
    jobTitle,
    jobUrl: jobUrl || '',
    platform: platform || '',
    resumeId: resumeId || undefined,
    status: status || 'Applied',
    note: note || '',
    skillMatchPercent: skillMatchPercent ?? 0,
  });

  await application.save();
  return sendJsonResult(res, true, application, "Application created successfully", 201);
});

exports.updateApplication = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { id } = req.params;
  const updates = req.body;

  const application = await ApplicationModel.findOneAndUpdate(
    { _id: id, userId: user._id },
    updates,
    { new: true }
  );

  if (!application) {
    return sendJsonResult(res, false, null, "Application not found", 404);
  }
  return sendJsonResult(res, true, application, "Application updated successfully");
});

exports.deleteApplication = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  const { id } = req.params;

  const application = await ApplicationModel.findOneAndDelete({ _id: id, userId: user._id });
  if (!application) {
    return sendJsonResult(res, false, null, "Application not found", 404);
  }
  return sendJsonResult(res, true, null, "Application deleted successfully");
});
