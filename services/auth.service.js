const jwt = require('jsonwebtoken')
const { UserModel, ProfileModel } = require('../dbModels')
const { RoleLevels } = require('../utils/constants')
const { getJwtSecret } = require('../utils')

function normalizePassword(password) {
  return String(password || '')
}

async function verifyUserPassword(user, password) {
  const normalizedPassword = normalizePassword(password)
  if (!normalizedPassword) return false
  if (!user) return false

  if (typeof user.comparePassword === 'function') {
    try {
      if (await user.comparePassword(normalizedPassword)) {
        return true
      }
    } catch {
      // Fall through to legacy compatibility check below.
    }
  }

  // Legacy compatibility: some old records may still have plaintext passwords.
  // Keep this as a fallback so auth and step-up verification remain consistent.
  return String(user.password || '') === normalizedPassword
}

async function verifyRequesterPassword(req, password) {
  const normalizedPassword = normalizePassword(password)
  if (!normalizedPassword) return false

  if (await verifyUserPassword(req?.user, normalizedPassword)) {
    return true
  }

  const requesterId = req?.user?._id || req?.user?.id
  if (!requesterId) return false
  const freshUser = await UserModel.findOne({ _id: requesterId })
  return verifyUserPassword(freshUser, normalizedPassword)
}

function extractAccessTokenFromRequest(req) {
  const authHeader = String(req?.headers?.authorization || '').trim()
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  const fallbackHeaderToken = authHeader && !bearerToken ? String(authHeader.split(' ')[1] || '').trim() : ''
  const queryToken = String(req?.query?.token || '').trim()
  return bearerToken || fallbackHeaderToken || queryToken || null
}

function decodeAccessToken(token) {
  if (!token) return null
  try {
    return jwt.verify(token, getJwtSecret())
  } catch {
    return null
  }
}

async function resolveAuthContextFromRequest(req) {
  const token = extractAccessTokenFromRequest(req)
  if (!token) {
    return { ok: false, status: 401, message: 'Please Login' }
  }

  const decodedData = decodeAccessToken(token)
  if (!decodedData) {
    return { ok: false, status: 401, message: 'Invalid or expired token' }
  }

  const user = await UserModel.findOne({ _id: decodedData.id })
  if (!user) {
    return { ok: false, status: 401, message: 'User not found' }
  }

  let profile = null
  if (decodedData.profileId) {
    profile = await ProfileModel.findOne({ _id: decodedData.profileId })
    if (!profile) {
      return { ok: false, status: 404, message: 'Profile not found' }
    }
  }

  return {
    ok: true,
    status: 200,
    data: {
      token,
      decodedData,
      user,
      profile,
    },
  }
}

function isRolePermitted(userRole, allowedRoles) {
  const normalizedUserRole = Number(userRole)
  const normalizedAllowedRoles = Array.isArray(allowedRoles)
    ? allowedRoles.map((role) => Number(role))
    : []
  const superAdminAllowedAsAdmin =
    normalizedUserRole === Number(RoleLevels.SUPER_ADMIN) &&
    normalizedAllowedRoles.includes(Number(RoleLevels.ADMIN))
  return normalizedAllowedRoles.includes(normalizedUserRole) || superAdminAllowedAsAdmin
}

module.exports = {
  decodeAccessToken,
  extractAccessTokenFromRequest,
  isRolePermitted,
  resolveAuthContextFromRequest,
  verifyRequesterPassword,
  verifyUserPassword,
}
