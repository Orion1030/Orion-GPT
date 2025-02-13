require('dotenv').config()
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { UserModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')
const { AWS_S3_BUCKET_NAME, APP_URL, SENDGRID_CHANGE_EMAIL_TEMPLATEID, SENDGRID_CHANGE_2FA_DISABLE_TEMPLATE_ID, SUPPORT_EMAIL } = process.env

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

exports.changePassword = asyncErrorHandler(async (req, res, next) => {
  const { newPassword, confirmPassword, oldPassword } = req.body
  const { user } = req
  if (!user) {
    return sendJsonResult(res, { success: false, msg: 'User not found' }, 400)
  }
  if (!newPassword) return sendJsonResult(res, { success: false, msg: 'Enter new password' }, 400)
  if (newPassword !== confirmPassword) return sendJsonResult(res, { success: false, msg: "New password and confirm password doesn't match" }, 400)
  const isPasswordMatched = await user.comparePassword(oldPassword)
  if (isPasswordMatched) user.password = newPassword
  else {
    return sendJsonResult(res, { success: false, msg: 'Incorrect old password' }, 400)
  }
  await user.save()
  return sendJsonResult(res, { success: true, msg: 'Password changed successfully' })
})
