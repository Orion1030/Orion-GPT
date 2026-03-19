const jwt = require('jsonwebtoken')

exports.getJwtSecret = function getJwtSecret() {
  const raw = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY
  const secret = raw && String(raw).trim()
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set or is empty. In Railway: add Variable JWT_SECRET with a long random value, then redeploy. Check deploy logs for "[startup] JWT_SECRET" to confirm the container receives it.'
    )
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
    expiresIn: '15m',
  })
}

