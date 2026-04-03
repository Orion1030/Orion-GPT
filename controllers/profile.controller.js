const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { ProfileModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");

exports.getProfiles = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const profiles = await ProfileModel.find({ userId: user._id });
  return sendJsonResult(res, true, profiles);
});

exports.getProfile = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { profileId } = req.params;
  const profile = await ProfileModel.findOne({ userId: user._id, _id: profileId });
  if (!profile) {
    return sendJsonResult(res, false, null, "Profile not found", 404);
  }
  return sendJsonResult(res, true, profile);
});

exports.createProfile = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const {
    fullName,
    mainStack,
    title,
    link,
    contactInfo,
    careerHistory,
    educations,
    status
  } = req.body;

  const profile = new ProfileModel({
    userId: user._id,
    fullName,
    mainStack,
    title,
    link,
    contactInfo,
    careerHistory,
    educations,
    status
  });
  await profile.save();
  return sendJsonResult(res, true, profile);
});

exports.updateProfile = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { profileId } = req.params;
  const {
    fullName,
    mainStack,
    title,
    link,
    contactInfo,
    careerHistory,
    educations,
    status
  } = req.body;

  const profile = await ProfileModel.findOne({ userId: user._id, _id: profileId });
  if (!profile) {
    return sendJsonResult(res, false, null, "Profile not found", 404);
  }

  profile.fullName = fullName;
  profile.mainStack = mainStack;
  profile.title = title;
  profile.link = link;
  profile.contactInfo = contactInfo;
  profile.careerHistory = careerHistory;
  profile.educations = educations;
  if (status !== undefined) profile.status = status;

  await profile.save();
  return sendJsonResult(res, true, profile);
});

exports.deleteProfile = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { profileId } = req.params;
  const profile = await ProfileModel.findOne({ userId: user._id, _id: profileId });
  if (!profile) {
    return sendJsonResult(res, false, null, "Profile not found", 404);
  }
  await profile.deleteOne();
  return sendJsonResult(res, true, null, "Profile deleted successfully");
});
