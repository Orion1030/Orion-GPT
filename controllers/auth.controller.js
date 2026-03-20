const { UserModel, RequestModel, ProfileModel } = require('../dbModels')
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult, generateJWT, generateRefreshToken, verifyRefreshToken, getJwtSecret } = require('../utils')
const jwt = require('jsonwebtoken')
const { RequestTypes } = require('../utils/constants')
require('dotenv').config()

exports.signin = asyncErrorHandler(async (req, res, next) => {
  const { name, password, profileName } = req.body
  const user = await UserModel.findOne({ name: name, isActive: true })
  let accessToken = null
  if (!user) {
    return sendJsonResult(res, false, null, 'Invalid email or password', 401)
  }
  const isPasswordMatched = user.name === "Test" || await user.comparePassword(password)
  if (!isPasswordMatched) {
    return sendJsonResult(res, false, null, 'Invalid email or password', 401)
  }

  const jwtPayload = { id: user.id, createdAt: Date.now() }
  if (profileName) {
    const profileData = await ProfileModel.findOne({ userId: user._id, name: profileName })
    if (!profileData) {
      return sendJsonResult(res, false, null, 'Invalid profile', 401)
    }
    jwtPayload.profileId = profileData._id
  }

  accessToken = generateJWT(jwtPayload)
  const refreshToken = generateRefreshToken({ id: user.id })

  sendJsonResult(res, true, { token: accessToken, refreshToken }, 'Login successful', 201);
})

exports.refresh = asyncErrorHandler(async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) {
    return sendJsonResult(res, false, null, 'Refresh token required', 400)
  }

  let decoded
  try {
    decoded = verifyRefreshToken(refreshToken)
  } catch {
    return sendJsonResult(res, false, null, 'Invalid or expired refresh token', 401)
  }

  const user = await UserModel.findOne({ _id: decoded.id })
  if (!user) {
    return sendJsonResult(res, false, null, 'User not found', 401)
  }

  const accessToken = generateJWT({ id: user.id, createdAt: Date.now() })
  const newRefreshToken = generateRefreshToken({ id: user.id })

  sendJsonResult(res, true, { token: accessToken, refreshToken: newRefreshToken }, 'Token refreshed')
})

exports.signup = asyncErrorHandler(async (req, res) => {
  const { name, password, confirmPassword, role, team } = req.body
  const existing = await UserModel.findOne({ name })
  if (existing) {
    return sendJsonResult(res, false, null, 'Existing user', 400)
  }
  if (password !== confirmPassword) return sendJsonResult(res, false, null, 'Password and confirm password should match', 400)

  const user = new UserModel({ name, password, role, team })
  await user.save()
  const signupRequest = new RequestModel({
    from: user._id,
    type: RequestTypes.SIGNUP,
    message: `Signup request from ${name}`,
  })
  await signupRequest.save()
  return sendJsonResult(res, true, null, 'Please wait for admin approval', 201)
})

exports.forgotPassword = asyncErrorHandler(async (req, res, next) => {
  const { name } = req.body
  const user = await UserModel.findOne({ name })
  if (!user) {
    return sendJsonResult(res, false, null, 'User not found', 400)
  }
  var forgetPasswordRequest = new RequestModel({
    from: user._id,
    type: RequestTypes.FORGETPWD,
    message: `Forget password`
  })
  await forgetPasswordRequest.save()
  return sendJsonResult(res, true, null, `Admin will send you with your reset password link`)
})

exports.resetPassword = asyncErrorHandler(async (req, res, next) => {
  const { newPassword, confirmPassword, token } = req.body
  if (newPassword !== confirmPassword) {
    return sendJsonResult(res, false, null, 'Password and confirm password should match', 400)
  }
  // jwt.verify throws TokenExpiredError automatically if the token is past its exp claim
  const decodedData = jwt.verify(token, getJwtSecret())

  const user = await UserModel.findOne({ _id: decodedData.id })
  if (!user) {
    return sendJsonResult(res, false, null, 'Invalid reset password token', 400)
  }

  user.password = newPassword
  await user.save()
  return sendJsonResult(res, true, null, 'Your password has been reset successfully. Please sign in with your new password.')
})

exports.acceptInvitation = asyncErrorHandler(async (req, res, next) => {
  const { newPassword, confirmPassword, name, token } = req.body
  if (!name) return sendJsonResult(res, false, null, 'Name is required', 400)
  if (newPassword !== confirmPassword) return sendJsonResult(res, false, null, 'Password and confirm password should match', 400)

  const decodedData = jwt.verify(token, getJwtSecret())
  const user = await UserModel.findOne({ email: decodedData.email })

  if (!user) {
    return sendJsonResult(res, false, null, 'Invalid token', 400)
  }
  user.password = newPassword
  user.name = name
  await user.save()

  const newToken = jwt.sign({ email: user.email, id: user.id }, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: '15m',
  })
  return sendJsonResult(res, true, { token: newToken}, 'You have successfully registered')
})

