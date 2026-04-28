const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { sendJsonResult } = require("../utils");
const { isAdminUser } = require("../utils/access");
const { parseProfileImportText } = require("../services/profileImport.service");

function toTargetUserId(req) {
  const fromQuery = req.query?.userId;
  if (typeof fromQuery === "string" && fromQuery.trim()) return fromQuery.trim();

  const fromBody = req.body?.userId;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();

  return null;
}

exports.parseProfileImport = asyncErrorHandler(async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    return sendJsonResult(res, false, null, "Missing text payload", 400);
  }
  if (text.length > 200 * 1024) {
    return sendJsonResult(res, false, null, "Input too large. Please trim the file.", 413);
  }

  const targetUserId = isAdminUser(req.user) ? toTargetUserId(req) : null;
  const { result, error } = await parseProfileImportText({
    actor: req.user,
    text,
    targetUserId,
  });

  if (error) {
    return sendJsonResult(res, false, null, error.message, error.statusCode || 500);
  }

  return sendJsonResult(res, true, result);
});
