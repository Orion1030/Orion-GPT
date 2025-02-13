require('dotenv').config()
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { UserModel } = require('../dbModels')

exports.changeMemberPassword = asyncErrorHandler(async (req, res, next) => {
  const { newPassword, confirmPassword, oldPassword, memberId } = req.body
  const user = await UserModel.findOne({ _id: memberId })
  if (!user) {
    return sendJsonResult(res, false, null, 'User not found', 400)
  }
  if (!newPassword) return sendJsonResult(res, false, null, 'Enter new password', 400)
  if (newPassword !== confirmPassword) return sendJsonResult(res, false, null, "New password and confirm password doesn't match", 400)
  const isPasswordMatched = await user.comparePassword(oldPassword)
  if (isPasswordMatched) user.password = newPassword
  else {
    return sendJsonResult(res, false, null, 'Incorrect old password', 400)
  }
  await user.save()
  return sendJsonResult(res, true, null, 'Password changed successfully')
})