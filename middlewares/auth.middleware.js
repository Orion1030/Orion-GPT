const jwt = require('jsonwebtoken')
const asyncErrorHandler = require('./asyncErrorHandler')
const { UserModel } = require('../dbModels')
const { sendJsonResult } = require('../utils')

exports.isAuthenticatedUser = asyncErrorHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return sendJsonResult(res, false, null, 'Please Login', 401)
  }
  const decodedData = jwt.verify(token, process.env.JWT_SECRET)
  const user = await UserModel.findOne({ email: decodedData.email })
  if (!user) return sendJsonResult(res, false, null, 'User not found', 401)
  req.user = user
  next()
})

exports.permit = (...allowedRoles) => {
  return asyncErrorHandler(async (req, res, next) => {
    const { user } = req
    if (!user) {
      return sendJsonResult(res, false, null, 'Please Login', 401)
    }
    if (!allowedRoles.includes(user.role)) { return sendJsonResult(res, false, null, 'Insufficient permission', 403) } 
    else next()
  })
}
