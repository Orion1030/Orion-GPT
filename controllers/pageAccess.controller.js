const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { sendJsonResult } = require("../utils");
const {
  isValidPageAccessKey,
  normalizeAllowedRoles,
} = require("../utils/pageAccess");
const {
  listPageAccessRules,
  updatePageAccessRule,
} = require("../services/pageAccess.service");

exports.getPageAccessRules = asyncErrorHandler(async (req, res) => {
  const rules = await listPageAccessRules();
  return sendJsonResult(res, true, rules);
});

exports.patchPageAccessRule = asyncErrorHandler(async (req, res) => {
  const { pageKey } = req.params;
  const normalizedPageKey = String(pageKey || "").trim();

  if (!isValidPageAccessKey(normalizedPageKey)) {
    return sendJsonResult(res, false, null, "Invalid page key", 400);
  }

  if (!Array.isArray(req.body?.allowedRoles)) {
    return sendJsonResult(res, false, null, "allowedRoles must be an array", 400);
  }

  const normalizedAllowedRoles = normalizeAllowedRoles(req.body.allowedRoles, {
    includeAdmin: true,
  });

  if (!normalizedAllowedRoles.length) {
    return sendJsonResult(res, false, null, "At least one role is required", 400);
  }

  const updated = await updatePageAccessRule(
    normalizedPageKey,
    normalizedAllowedRoles,
    req.user?._id || null
  );

  return sendJsonResult(res, true, updated, "Page access updated");
});
