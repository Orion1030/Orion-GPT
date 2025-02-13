const { UserModel, RequestModel } = require('../dbModels')
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { isTokenExpired, sendJsonResult } = require('./../utils')
const jwt = require('jsonwebtoken')
const { RoleLevels, RequestTypes } = require('../utils/constants')
require('dotenv').config()

const {
  JWT_SECRET
} = process.env

exports.signin = asyncErrorHandler(async (req, res, next) => {
  const { email, password } = req.body
  const user = await UserModel.findOne({ email })

  if (!user) {
    return sendJsonResult(res, false, null, 'Invalid email or password', 401)
  }
  const isPasswordMatched = await user.comparePassword(password)
  if (!isPasswordMatched) {
    return sendJsonResult(res, false, null, 'Invalid email or password', 401)
  }
  
  token = jwt.sign({ email: user.email, id: user.id }, secretKey, {
    header,
    algorithm: 'HS256',
    expiresIn: Date.now() + 15 * 60 * 1000
  })
  sendJsonResult(res, true, { token }, 'Login successful', 201);
})

exports.signup = asyncErrorHandler(async (req, res) => {
  const { email, password, confirmPassword, name, role } = req.body
  let user = await UserModel.findOne({ email })
  if (user) {
    return sendJsonResult(res, false, 'Existing user', 400)
  } else {
    if (password !== confirmPassword) return sendJsonResult(res, false, null, 'Password and confirm password should match', 400)
    
    if (!user) {
      user = new UserModel({ email, name, password })
      await user.save()
    } else {
      user.currentCompany = newCompany.id
      user.password = password
      user.name = name,
      user.role = role
      await user.save()
    }
    
    token = jwt.sign({ email: user.email, id: user.id }, secretKey, {
      header,
      algorithm: 'HS256',
      expiresIn: Date.now() + 15 * 60 * 1000
    })
    return sendJsonResult(res, true, { token }, 'Confirmation email sent')
  }
})

exports.forgotPassword = asyncErrorHandler(async (req, res, next) => {
  const { email } = req.body
  const user = await UserModel.findOne({ email })
  if (!user) {
    return sendJsonResult(res, false, null, 'User not found', 400)
  }
  // const resetToken = AuthService.generateJWT({
  //   email: user.email,
  //   id: user._id.toString(),
  //   expiresIn: Date.now() + 60 * 60 * 1000
  // })
  var resetPasswordRequest = new RequestModel({
    from: email,
    type: RequestTypes.RESETPWD,
    message: `Forget password`
  })
  await resetPasswordRequest.save()
  return sendJsonResult(res, true, null, `Admin will send you with your reset password link`)
})

exports.resetPassword = asyncErrorHandler(async (req, res, next) => {
  const { newPassword, confirmPassword, token } = req.body
  if (newPassword !== confirmPassword) {
    return sendJsonResult(res, false, null, 'Password and confirm password should match', 400)
  }
  const decodedData = jwt.verify(token, JWT_SECRET)

  const user = await UserModel.findOne({
    email: decodedData.email
  })

  if (!user) {
    return sendJsonResult(res, false, null, 'Invalid reset password token', 400)
  }

  if (isTokenExpired(decodedData.expiresIn)) {
    return sendJsonResult(res, false, null, 'Token was expired', 403)
  }

  user.password = newPassword
  await user.save()
  return sendJsonResult(res, true, null, 'Your password has been reset successfully. Please sign in with your new password.')
})

exports.acceptInvitation = asyncErrorHandler(async (req, res, next) => {
  const { newPassword, confirmPassword, name, token } = req.body
  if (!name) return sendJsonResult(res, false, 'Name is required', 400)
  if (newPassword !== confirmPassword) return sendJsonResult(res, false, null, 'Password and confirm password should match', 400)

  const decodedData = jwt.verify(token, JWT_SECRET)
  const user = await UserModel.findOne({ email: decodedData.email })

  if (!user) {
    return sendJsonResult(res, false, null, 'Invalid token', 400)
  }
  user.password = newPassword
  user.name = name
  await user.save()
  
  const newToken = jwt.sign({ email: user.email, id: user.id }, secretKey, {
    header,
    algorithm: 'HS256',
    expiresIn: Date.now() + 15 * 60 * 1000
  })
  return sendJsonResult(res, true, { token: newToken}, 'You have successfully registered')
})

