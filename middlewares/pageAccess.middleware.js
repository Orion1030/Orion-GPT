const asyncErrorHandler = require("./asyncErrorHandler");
const { sendJsonResult } = require("../utils");
const { isValidPageAccessKey } = require("../utils/pageAccess");
const { getAllowedRolesForPage } = require("../services/pageAccess.service");
const { RoleLevels } = require("../utils/constants");

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
    const guestAllowedViaUserFallback =
      role === RoleLevels.GUEST && allowedRoles.includes(RoleLevels.User);

    if (!allowedRoles.includes(role) && !guestAllowedViaUserFallback) {
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
