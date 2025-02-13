const jwt = require('jsonwebtoken')
exports.isTokenExpired = (expirationDate) => {
  return new Date() > expirationDate
}

exports.calculateExpiry = (hours) => {
  return Date.now() + hours * 60 * 60 * 1000
}

exports.sendJsonResult = (res, status, data = null, message = null, statusCode = 200) => {
  let returnData = {
    success: status,
    data,
    message,
  }
  return res.status(statusCode).json(returnData);
}

exports.generateJWT = (payload, secretKey = JWT_SECRET, header = {}) => {
  return jwt.sign(payload, secretKey, {
    header,
    algorithm: 'HS256',
    expiresIn: Date.now() + 15 * 60 * 1000
  })
}

