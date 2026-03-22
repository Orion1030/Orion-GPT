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

/**
 * @param {boolean} success
 * @param {object} [options] - `{ showNotification?: boolean }` — when set, controls whether the SPA should toast.
 *   If omitted: errors use `showNotification = (statusCode >= 500)`; successful responses default to `false`.
 */
exports.sendJsonResult = (res, success, data = null, message = null, statusCode = 200, options = {}) => {
  const { showNotification } = options
  const returnData = {
    success,
    data,
    message,
  }
  if (showNotification !== undefined) {
    returnData.showNotification = showNotification
  } else if (!success) {
    returnData.showNotification = statusCode >= 500
  } else {
    returnData.showNotification = false
  }
  return res.status(statusCode).json(returnData)
}

exports.generateJWT = (payload, header = {}) => {
  return jwt.sign(payload, exports.getJwtSecret(), {
    header,
    algorithm: 'HS256',
    expiresIn: '15m',
  })
}

exports.generateRefreshToken = (payload) => {
  return jwt.sign({ ...payload, type: 'refresh' }, exports.getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: '7d',
  })
}

exports.verifyRefreshToken = (token) => {
  const decoded = jwt.verify(token, exports.getJwtSecret())
  if (decoded.type !== 'refresh') {
    throw new Error('Not a refresh token')
  }
  return decoded
}

