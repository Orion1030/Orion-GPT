const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { UserModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { verifyUserPassword } = require("../services/auth.service");
const { buildUsageMetricsMap, createEmptyUsageMetrics } = require("../services/usageMetrics.service");
const { APP_URL } = process.env;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// exports.getAuthUserInfo = asyncErrorHandler(async (req, res, next) => {
//   const { user } = req
//   const companies = await UserService.getInvolvedCompanies(user)
//   const sites = await UserService.getInvolvedSites(user)
//   const notifications = []
//   for (let i = 0; i < sites.length; i++) {
//     const site = sites[i]
//     const count = await SiteService.getUnreadNotificationCount(sites[i].id)
//     if (count > 0) notifications.push({ siteName: site.name, siteId: site.id, count })
//   }
//   return sendJsonResult(res, { success: true, data: { user, notifications, companies } })
// })

// exports.getPresignedUrl = asyncErrorHandler(async (req, res, next) => {
//   try {
//     const { fileName, fileType, folderName } = req.query

//     const returnData = await AWSService.getPresignedURL(fileName, fileType, folderName ?? 'avatar', AWS_S3_BUCKET_NAME)
//     return sendJsonResult(res, { success: true, data: returnData })
//   } catch (error) {
//     throw new Error("Can't generate presigned url")
//   }
// })

// exports.updateUserProfile = asyncErrorHandler(async (req, res, next) => {
//   const { email, name, jobTitle, avatar } = req.body
//   const { user } = req
//   if (!user) {
//     return sendJsonResult(res, { success: false, msg: 'User not found' }, 400)
//   }
//   if (name) {
//     user.name = name
//   }
//   if (jobTitle) {
//     user.jobTitle = jobTitle
//   }
//   if (avatar) {
//     user.avatar = avatar
//   }
//   if (email && user.email !== email) {
//     const emailConfirmToken = AuthService.generateJWT({
//       expiresIn: calculateExpiry(1),
//       email,
//       id: user._id.toString()
//     })
//     const templateData = {
//       user_name: user.name,
//       support_email: SUPPORT_EMAIL,
//       confirm_url: `${APP_URL}/user/email/confirm?token=${emailConfirmToken}`
//     }
//     try {
//       await user.save()
//     } catch (ex) {
//       if (ex.code === 11000) {
//         return sendJsonResult(res, { success: false, msg: 'The email address is already existed.' }, 400)
//       } else {
//         return sendJsonResult(res, { success: false, msg: ex.message }, 500)
//       }
//     }
//     await MailService.sendEmail(email, SENDGRID_CHANGE_EMAIL_TEMPLATEID, templateData)
//     return sendJsonResult(res, { success: true, msg: `User profile updated successfully. Confirmation email was sent to ${email}` })
//   }
//   await user.save()
//   return sendJsonResult(res, { success: true, msg: 'User profile updated successfully' })
// })

// exports.confirmChangeEmail = asyncErrorHandler(async (req, res, next) => {
//   const { token } = req.query
//   const decodedData = jwt.verify(token, process.env.JWT_SECRET)
//   const { expiresIn, id } = decodedData
//   if (isTokenExpired(expiresIn)) {
//     return sendJsonResult(res, { success: false, msg: 'Token was expired' }, 403)
//   }
//   const user = await UserModel.findById(id)
//   user.emailChangeConfirmed = true
//   await user.save()
//   return sendToken(user, 200, res)
// })

function toAccountDto(user) {
  return {
    id: String(user._id),
    name: user.name || "",
    email: user.email || "",
    contactNumber: user.contactNumber || "",
    avatarUrl: user.avatarUrl || "",
    avatarStorageKey: user.avatarStorageKey || "",
    avatarUpdatedAt: user.avatarUpdatedAt || null,
    team: user.team || "",
    role: Number(user.role),
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

exports.getAccountProfile = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  if (!user?._id) {
    return sendJsonResult(res, false, null, "User not found", 401);
  }

  return sendJsonResult(res, true, toAccountDto(user));
});

exports.updateAccountProfile = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  if (!user?._id) {
    return sendJsonResult(res, false, null, "User not found", 401);
  }

  const updates = {};
  const body = req.body || {};
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (hasOwn("role")) {
    return sendJsonResult(res, false, null, "Role cannot be updated here", 403);
  }
  if (hasOwn("isActive")) {
    return sendJsonResult(
      res,
      false,
      null,
      "Account activation cannot be updated here",
      403,
    );
  }
  if (hasOwn("memberId")) {
    return sendJsonResult(res, false, null, "User ID cannot be updated here", 403);
  }

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) {
      return sendJsonResult(res, false, null, "Name is required", 400);
    }
    updates.name = name;
  }

  if (body.email !== undefined) {
    const email = String(body.email || "").trim().toLowerCase();
    if (email && !EMAIL_REGEX.test(email)) {
      return sendJsonResult(res, false, null, "Invalid email format", 400);
    }
    updates.email = email;
  }

  if (body.contactNumber !== undefined) {
    const contactNumber = String(body.contactNumber || "").trim();
    if (contactNumber.length > 32) {
      return sendJsonResult(
        res,
        false,
        null,
        "Contact number is too long",
        400,
      );
    }
    updates.contactNumber = contactNumber;
  }

  if (body.avatarUrl !== undefined) {
    const avatarUrl = String(body.avatarUrl || "").trim();
    updates.avatarUrl = avatarUrl;
    updates.avatarUpdatedAt = new Date();
  }

  if (body.avatarStorageKey !== undefined) {
    updates.avatarStorageKey = String(body.avatarStorageKey || "").trim();
  }

  if (Object.keys(updates).length === 0) {
    return sendJsonResult(res, false, null, "No update fields provided", 400);
  }

  if (
    updates.name &&
    updates.name !== user.name &&
    (await UserModel.exists({ name: updates.name, _id: { $ne: user._id } }))
  ) {
    return sendJsonResult(res, false, null, "Account name is already in use", 400);
  }

  if (
    updates.email &&
    updates.email !== user.email &&
    (await UserModel.exists({ email: updates.email, _id: { $ne: user._id } }))
  ) {
    return sendJsonResult(res, false, null, "Email is already in use", 400);
  }

  Object.assign(user, updates);
  await user.save();

  return sendJsonResult(
    res,
    true,
    toAccountDto(user),
    "Account profile updated successfully",
  );
});

exports.changePassword = asyncErrorHandler(async (req, res, next) => {
  const { newPassword, confirmPassword, oldPassword } = req.body;
  const { user } = req;
  if (!user) {
    return sendJsonResult(res, false, null, "User not found", 400);
  }
  if (!newPassword)
    return sendJsonResult(res, false, null, "Enter new password", 400);
  if (newPassword !== confirmPassword)
    return sendJsonResult(
      res,
      false,
      null,
      "New password and confirm password doesn't match",
      400,
    );
  const isPasswordMatched = await verifyUserPassword(user, oldPassword);
  if (isPasswordMatched) user.password = newPassword;
  else {
    return sendJsonResult(res, false, null, "Incorrect old password", 400);
  }
  await user.save();
  return sendJsonResult(res, true, null, "Password changed successfully");
});

exports.getAccountUsageMetrics = asyncErrorHandler(async (req, res) => {
  const { user } = req;
  if (!user?._id) {
    return sendJsonResult(res, false, null, "User not found", 401);
  }

  const metricsByUserId = await buildUsageMetricsMap({ userIds: [user._id] });
  const normalizedId = String(user._id);

  return sendJsonResult(res, true, {
    generatedAt: new Date().toISOString(),
    userId: normalizedId,
    metrics: metricsByUserId[normalizedId] || createEmptyUsageMetrics(),
  });
});
