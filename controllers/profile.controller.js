const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { ProfileModel, TemplateModel, StackModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { isAdminUser, buildUserScopeFilter } = require("../utils/access");

function toTargetUserId(req) {
  const fromQuery = req.query?.userId;
  if (typeof fromQuery === "string" && fromQuery.trim()) return fromQuery.trim();
  const fromBody = req.body?.userId;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  return null;
}

function toBooleanQuery(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
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

function toNullableId(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "object") {
    const nestedId = value?._id ?? value?.id;
    if (nestedId == null) return null;
    const trimmed = String(nestedId).trim();
    return trimmed || null;
  }
  const trimmed = String(value).trim();
  return trimmed || null;
}

async function resolveDefaultTemplateAssignment({
  rawDefaultTemplateId,
  ownerUserId,
}) {
  const parsedId = toNullableId(rawDefaultTemplateId);
  if (parsedId === undefined) {
    return { shouldSet: false, value: null };
  }
  if (!parsedId) {
    return { shouldSet: true, value: null };
  }

  const template = await TemplateModel.findOne({
    _id: parsedId,
    $or: [{ isBuiltIn: true }, { userId: ownerUserId }],
  })
    .select("_id")
    .lean();

  if (!template) {
    return {
      shouldSet: false,
      value: null,
      error: "defaultTemplateId is invalid",
      status: 404,
    };
  }

  return { shouldSet: true, value: template._id };
}

async function resolveStackAssignment({ rawStackId, rawMainStack }) {
  const parsedStackId = toNullableId(rawStackId);
  const normalizedMainStack = String(rawMainStack || "").trim();

  if (parsedStackId) {
    const stack = await StackModel.findOne({ _id: parsedStackId })
      .select("_id title")
      .lean();
    if (!stack) {
      return {
        shouldSet: false,
        stackId: null,
        mainStack: "",
        error: "stackId is invalid",
        status: 404,
      };
    }
    return {
      shouldSet: true,
      stackId: stack._id,
      mainStack: String(stack.title || "").trim(),
    };
  }

  if (!normalizedMainStack) {
    return {
      shouldSet: false,
      stackId: null,
      mainStack: "",
      error: "mainStack is required",
      status: 400,
    };
  }

  return {
    shouldSet: true,
    stackId: null,
    mainStack: normalizedMainStack,
  };
}

exports.getProfiles = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  let scopeFilter = buildUserScopeFilter(user, isAdminUser(user) ? toTargetUserId(req) : null);
  if (isAdminUser(user)) {
    const targetUserId = toTargetUserId(req);
    const includeOtherUsers = toBooleanQuery(req.query?.includeOtherUsers, false);
    if (targetUserId) {
      scopeFilter = { userId: targetUserId };
    } else {
      scopeFilter = includeOtherUsers ? {} : { userId: user._id };
    }
  }
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
    stackId,
    defaultTemplateId,
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
  const ownerUserId = targetUserId || user._id;
  const templateAssignment = await resolveDefaultTemplateAssignment({
    rawDefaultTemplateId: defaultTemplateId,
    ownerUserId,
  });
  const stackAssignment = await resolveStackAssignment({
    rawStackId: stackId,
    rawMainStack: mainStack,
  });
  if (templateAssignment.error) {
    return sendJsonResult(
      res,
      false,
      null,
      templateAssignment.error,
      templateAssignment.status || 400
    );
  }
  if (stackAssignment.error) {
    return sendJsonResult(
      res,
      false,
      null,
      stackAssignment.error,
      stackAssignment.status || 400
    );
  }

  const profilePayload = {
    userId: ownerUserId,
    fullName,
    mainStack: stackAssignment.mainStack,
    title,
    link,
    contactInfo,
    careerHistory: normalizedCareerHistory,
    educations,
    status
  };
  if (templateAssignment.shouldSet) {
    profilePayload.defaultTemplateId = templateAssignment.value;
  }
  if (stackAssignment.shouldSet) {
    profilePayload.stackId = stackAssignment.stackId;
  }

  const profile = new ProfileModel(profilePayload);
  await profile.save();
  return sendJsonResult(res, true, profile);
});

exports.updateProfile = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { profileId } = req.params;
  const {
    stackId,
    defaultTemplateId,
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
  const templateAssignment = await resolveDefaultTemplateAssignment({
    rawDefaultTemplateId: defaultTemplateId,
    ownerUserId: profile.userId,
  });
  const stackAssignment = await resolveStackAssignment({
    rawStackId: stackId !== undefined ? stackId : profile.stackId,
    rawMainStack: mainStack !== undefined ? mainStack : profile.mainStack,
  });
  if (templateAssignment.error) {
    return sendJsonResult(
      res,
      false,
      null,
      templateAssignment.error,
      templateAssignment.status || 400
    );
  }
  if (stackAssignment.error) {
    return sendJsonResult(
      res,
      false,
      null,
      stackAssignment.error,
      stackAssignment.status || 400
    );
  }

  profile.fullName = fullName;
  profile.mainStack = stackAssignment.mainStack;
  profile.title = title;
  profile.link = link;
  profile.contactInfo = contactInfo;
  profile.careerHistory = normalizedCareerHistory;
  profile.educations = educations;
  if (templateAssignment.shouldSet) {
    profile.defaultTemplateId = templateAssignment.value;
  }
  if (stackAssignment.shouldSet) {
    profile.stackId = stackAssignment.stackId;
  }
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
