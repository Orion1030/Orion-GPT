const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { ProfileModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { isAdminUser, buildUserScopeFilter } = require("../utils/access");

function toTargetUserId(req) {
  const fromQuery = req.query?.userId;
  if (typeof fromQuery === "string" && fromQuery.trim()) return fromQuery.trim();
  const fromBody = req.body?.userId;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  return null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeCareerKeyPoints(value) {
  if (typeof value === "string") return value.trim();

  if (Array.isArray(value)) {
    const lines = value.map((item) => String(item || "").trim()).filter(Boolean);
    if (!lines.length) return "";
    const listItems = lines.map((line) =>
      /<[a-z][\s\S]*>/i.test(line)
        ? `<li>${line}</li>`
        : `<li>${escapeHtml(line)}</li>`
    );
    return `<ul>${listItems.join("")}</ul>`;
  }

  return "";
}

function normalizeCareerHistory(careerHistory) {
  if (!Array.isArray(careerHistory)) return careerHistory;
  return careerHistory.map((entry) => ({
    ...entry,
    keyPoints: normalizeCareerKeyPoints(entry?.keyPoints),
  }));
}

exports.getProfiles = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const scopeFilter = buildUserScopeFilter(user, isAdminUser(user) ? toTargetUserId(req) : null);
  const profiles = await ProfileModel.find(scopeFilter).sort({ updatedAt: -1 });
  return sendJsonResult(res, true, profiles);
});

exports.getProfile = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { profileId } = req.params;
  const scopeFilter = buildUserScopeFilter(user, isAdminUser(user) ? toTargetUserId(req) : null);
  const profile = await ProfileModel.findOne({ ...scopeFilter, _id: profileId });
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
  const normalizedCareerHistory = normalizeCareerHistory(careerHistory);
  const targetUserId = isAdminUser(user) ? toTargetUserId(req) : null;

  const profile = new ProfileModel({
    userId: targetUserId || user._id,
    fullName,
    mainStack,
    title,
    link,
    contactInfo,
    careerHistory: normalizedCareerHistory,
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
  const normalizedCareerHistory = normalizeCareerHistory(careerHistory);
  const scopeFilter = buildUserScopeFilter(user, isAdminUser(user) ? toTargetUserId(req) : null);

  const profile = await ProfileModel.findOne({ ...scopeFilter, _id: profileId });
  if (!profile) {
    return sendJsonResult(res, false, null, "Profile not found", 404);
  }

  profile.fullName = fullName;
  profile.mainStack = mainStack;
  profile.title = title;
  profile.link = link;
  profile.contactInfo = contactInfo;
  profile.careerHistory = normalizedCareerHistory;
  profile.educations = educations;
  if (status !== undefined) profile.status = status;

  await profile.save();
  return sendJsonResult(res, true, profile);
});

exports.deleteProfile = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { profileId } = req.params;
  const scopeFilter = buildUserScopeFilter(user, isAdminUser(user) ? toTargetUserId(req) : null);
  const profile = await ProfileModel.findOne({ ...scopeFilter, _id: profileId });
  if (!profile) {
    return sendJsonResult(res, false, null, "Profile not found", 404);
  }
  await profile.deleteOne();
  return sendJsonResult(res, true, null, "Profile deleted successfully");
});
