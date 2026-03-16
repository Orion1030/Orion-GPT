const jwt = require('jsonwebtoken')

exports.getJwtSecret = function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret || !String(secret).trim()) {
    throw new Error('JWT_SECRET is not set or is empty. Set it in your environment (e.g. Railway Variables).')
  }
  return secret
}

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

exports.generateJWT = (payload, header = {}) => {
  return jwt.sign(payload, exports.getJwtSecret(), {
    header,
    algorithm: 'HS256',
    expiresIn: Date.now() + 15 * 60 * 1000
  })
}

