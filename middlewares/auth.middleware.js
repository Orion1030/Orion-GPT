const jwt = require('jsonwebtoken')
const asyncErrorHandler = require('./asyncErrorHandler')
const { UserModel, ProfileModel } = require('../dbModels')
const { sendJsonResult, getJwtSecret } = require('../utils')
const { RoleLevels } = require('../utils/constants')

exports.isAuthenticatedUser = asyncErrorHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization
  // Allow token via query param for SSE endpoints (EventSource can't set headers)
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token

  if (!token) {
    return sendJsonResult(res, false, null, 'Please Login', 401)
  }

  let decodedData
  try {
    decodedData = jwt.verify(token, getJwtSecret())
  } catch (err) {
    return sendJsonResult(res, false, null, 'Invalid or expired token', 401)
  }

  const user = await UserModel.findOne({ _id: decodedData.id })
  if (!user) return sendJsonResult(res, false, null, 'User not found', 401)
  req.user = user

  if (decodedData.profileId) {
    const profile = await ProfileModel.findOne({ _id: decodedData.profileId })
    if (!profile) return sendJsonResult(res, false, null, 'Profile not found', 404)
    req.profile = profile
  }
  await next()
})
exports.permit = (allowedRoles) => {
  return asyncErrorHandler(async (req, res, next) => {
    const { user } = req
    if (!user) {
      return sendJsonResult(res, false, null, 'Please Login', 401)
    }
    const userRole = Number(user.role)
    const normalizedAllowedRoles = Array.isArray(allowedRoles) ? allowedRoles.map((role) => Number(role)) : []
    const superAdminAllowedAsAdmin =
      userRole === Number(RoleLevels.SUPER_ADMIN) &&
      normalizedAllowedRoles.includes(Number(RoleLevels.ADMIN))
    const permitted = normalizedAllowedRoles.includes(userRole) || superAdminAllowedAsAdmin
    if (!permitted) {
      return sendJsonResult(res, false, null, 'Insufficient permission', 403, { showNotification: true })
    }
    else next()
  })
}
