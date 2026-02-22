require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { UserModel, ApplicationModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { APP_URL } = process.env;

exports.getAllApplications = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const applications = await ApplicationModel.find({ userId: user._id  });
  return sendJsonResult(res, true, applications ?? []);
});
exports.getApplicationsByProfileId = asyncErrorHandler(async (req, res, next) => {
  const { user } = req
  const { profileId } = req.params;
  const applications = await ApplicationModel.find({ profileId, userId: user._id });
  return sendJsonResult(res, true, applications ?? []);
});
exports.createApplication = asyncErrorHandler(async (req, res, next) => {
  const { user, profile } = req;
  const { jobId, resumeId } = req.body;
  const application = new ApplicationModel({
    userId: user._id,
    jobId,
    profileId: profile._id,
    resumeId
  });
  await application.save();
  return sendJsonResult(res, true, application, "Application created successfully", 201);
});
exports.updateApplication = asyncErrorHandler(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;
  const application = await ApplicationModel.findByIdAndUpdate(id, updates, { new: true });
  if (!application) {
    return sendJsonResult(res, false, null, "Application not found", 404);
  }
  return sendJsonResult(res, true, application, "Application updated successfully");
});
