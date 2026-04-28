const { UserModel, ProfileModel, NotificationModel } = require('../dbModels')
const asyncErrorHandler = require('../middlewares/asyncErrorHandler')
const { sendJsonResult, generateJWT, generateRefreshToken, verifyRefreshToken, getJwtSecret } = require('../utils')
const { verifyUserPassword } = require('../services/auth.service')
const jwt = require('jsonwebtoken')
const { RoleLevels } = require('../utils/constants')

exports.signin = asyncErrorHandler(async (req, res, next) => {
  const { email, password, profileName } = req.body
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const user = await UserModel.findOne({ email: normalizedEmail })
  let accessToken = null
  if (!user) {
    return sendJsonResult(res, false, null, 'Invalid email or password', 401)
  }
  if (!user.isActive) {
    return sendJsonResult(res, false, null, 'Your account is pending approval. Please wait for an admin to activate it.', 403)
  }
  const isPasswordMatched = await verifyUserPassword(user, password)
  if (!isPasswordMatched) {
    return sendJsonResult(res, false, null, 'Invalid email or password', 401)
  }

  try {
    const isFirstLogin = !user.lastLogin
    user.lastLogin = new Date()
    await user.save()
    if (isFirstLogin) {
      await NotificationModel.create({
        toUserId: user._id,
        fromUserId: null,
        type: 'auth.welcome',
        title: 'Welcome to Jobsy',
        message: 'Your account is active. Explore your dashboard to get started.',
        level: 'success',
        link: '/dashboard',
      })
    }
  } catch (error) {
    // Do not block login if tracking fails.
    console.error('Failed to update lastLogin', error)
  }

  const jwtPayload = { id: user.id, role: user.role, createdAt: Date.now() }
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

  const accessToken = generateJWT({ id: user.id, role: user.role, createdAt: Date.now() })
  const newRefreshToken = generateRefreshToken({ id: user.id })

  sendJsonResult(res, true, { token: accessToken, refreshToken: newRefreshToken }, 'Token refreshed')
})

exports.signup = asyncErrorHandler(async (req, res) => {
  const { name, email, password, confirmPassword } = req.body
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) {
    return sendJsonResult(res, false, null, 'Email is required', 400)
  }

  const existingByName = await UserModel.findOne({ name })
  if (existingByName) {
    return sendJsonResult(res, false, null, 'Existing user', 400)
  }

  const existingByEmail = await UserModel.findOne({ email: normalizedEmail })
  if (existingByEmail) {
    return sendJsonResult(res, false, null, 'Email is already in use', 400)
  }
  if (password !== confirmPassword) return sendJsonResult(res, false, null, 'Password and confirm password should match', 400)

  const user = new UserModel({
    name,
    email: normalizedEmail,
    password,
    role: RoleLevels.User,
    isActive: false,
    managedByUserId: null,
    team: '',
  })
  await user.save()

  try {
    const admins = await UserModel.find({
      role: { $in: [RoleLevels.ADMIN, RoleLevels.SUPER_ADMIN] },
      isActive: true,
    })
      .select('_id')
      .lean()
    if (admins.length > 0) {
      await NotificationModel.insertMany(
        admins.map((admin) => ({
          toUserId: admin._id,
          fromUserId: user._id,
          type: 'admin.signup_request',
          title: 'New signup request',
          message: `${name} (${normalizedEmail}) is waiting for approval.`,
          level: 'info',
          link: '/admin?tab=users',
          metadata: { userId: String(user._id) },
        })),
        { ordered: false }
      )
    }
  } catch (error) {
    console.warn('Failed to notify admins about signup request', error)
  }
  return sendJsonResult(res, true, null, 'Please wait for admin approval', 201)
})

exports.forgotPassword = asyncErrorHandler(async (req, res, next) => {
  const { email } = req.body
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const user = await UserModel.findOne({ email: normalizedEmail })
  if (!user) {
    return sendJsonResult(res, false, null, 'User not found', 400)
  }
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

