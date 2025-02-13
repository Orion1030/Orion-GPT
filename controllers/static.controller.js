const { sendJsonResult } = require("../utils");
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");

exports.checkNormal = asyncErrorHandler(async (req, res, next) => {
  return sendJsonResult(res, true, null, "Password changed successfully", 200);
});
