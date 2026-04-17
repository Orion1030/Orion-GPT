const { RoleLevels } = require('./constants')

function isAdminUser(user) {
  const role = Number(user?.role)
  return role === RoleLevels.ADMIN || role === RoleLevels.SUPER_ADMIN
}

/**
 * Build ownership filter for user-owned documents.
 * - Admin can access all records by default (empty filter), or one user's data when `targetUserId` is provided.
 * - Non-admin users are always restricted to their own `userId`.
 */
function buildUserScopeFilter(user, targetUserId = null) {
  if (isAdminUser(user)) {
    if (targetUserId) return { userId: targetUserId }
    return {}
  }
  return { userId: user?._id }
}

module.exports = {
  isAdminUser,
  buildUserScopeFilter,
}
