const asyncErrorHandler = require('./asyncErrorHandler')
const { sendJsonResult } = require('../utils')
const { isRolePermitted, resolveAuthContextFromRequest } = require('../services/auth.service')

exports.isAuthenticatedUser = asyncErrorHandler(async (req, res, next) => {
  const context = await resolveAuthContextFromRequest(req)
  if (!context.ok) {
    return sendJsonResult(res, false, null, context.message, context.status)
  }

  req.user = context.data.user
  if (context.data.profile) {
    req.profile = context.data.profile
  }
  return next()
})
exports.permit = (allowedRoles) => {
  return asyncErrorHandler(async (req, res, next) => {
    const { user } = req
    if (!user) {
      return sendJsonResult(res, false, null, 'Please Login', 401)
    }
    const permitted = isRolePermitted(user.role, allowedRoles)
    if (!permitted) {
      return sendJsonResult(res, false, null, 'Insufficient permission', 403, { showNotification: true })
    }
    return next()
  })
}
