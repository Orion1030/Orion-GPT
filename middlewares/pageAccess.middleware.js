const asyncErrorHandler = require("./asyncErrorHandler");
const { sendJsonResult } = require("../utils");
const { isValidPageAccessKey } = require("../utils/pageAccess");
const { getAllowedRolesForPage } = require("../services/pageAccess.service");

exports.requirePageAccess = (pageKey) =>
  asyncErrorHandler(async (req, res, next) => {
    const normalizedPageKey = String(pageKey || "").trim();
    if (!isValidPageAccessKey(normalizedPageKey)) {
      return sendJsonResult(res, false, null, "Invalid page access key", 400);
    }

    if (!req.user) {
      return sendJsonResult(res, false, null, "Please Login", 401);
    }

    const allowedRoles = await getAllowedRolesForPage(normalizedPageKey);
    const role = Number(req.user.role);

    if (!allowedRoles.includes(role)) {
      return sendJsonResult(
        res,
        false,
        null,
        "Insufficient permission",
        403,
        { showNotification: true }
      );
    }

    return next();
  });
