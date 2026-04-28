const { ProfileModel, UserModel } = require('../dbModels')
const { isAdminUser } = require('../utils/access')
const { RoleLevels } = require('../utils/constants')
const { toIdString } = require('../utils/managementScope')

function hasOwnKeys(value) {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0)
}

function mergeMongoFilters(baseFilter, extraFilter = {}) {
  const hasBase = hasOwnKeys(baseFilter)
  const hasExtra = hasOwnKeys(extraFilter)

  if (!hasBase) return hasExtra ? extraFilter : {}
  if (!hasExtra) return baseFilter
  return { $and: [baseFilter, extraFilter] }
}

async function getAssignedProfileIdsForUser(userId, options = {}) {
  const normalizedUserId = toIdString(userId)
  if (!normalizedUserId) return []

  const isGuest = options.isGuest
  if (isGuest === false) return []

  const guestQuery =
    isGuest === true
      ? { _id: normalizedUserId }
      : { _id: normalizedUserId, role: RoleLevels.GUEST }

  const guest = await UserModel.findOne(guestQuery)
    .select('_id assignedProfileIds')
    .lean()

  const assignedIds = Array.isArray(guest?.assignedProfileIds)
    ? guest.assignedProfileIds
        .map((value) => toIdString(value))
        .filter(Boolean)
    : []

  return Array.from(new Set(assignedIds))
}

async function buildReadableProfileFilterForUser(userId, extraFilter = {}, options = {}) {
  const normalizedUserId = toIdString(userId)
  if (!normalizedUserId) {
    return mergeMongoFilters({ _id: null }, extraFilter)
  }

  const assignedProfileIds = await getAssignedProfileIdsForUser(normalizedUserId, options)
  const baseFilter = assignedProfileIds.length
    ? {
        $or: [
          { userId: normalizedUserId },
          { _id: { $in: assignedProfileIds } },
        ],
      }
    : { userId: normalizedUserId }

  return mergeMongoFilters(baseFilter, extraFilter)
}

function buildWritableProfileFilterForUser(userId, extraFilter = {}) {
  const normalizedUserId = toIdString(userId)
  const baseFilter = normalizedUserId ? { userId: normalizedUserId } : { _id: null }
  return mergeMongoFilters(baseFilter, extraFilter)
}

function buildProfileAccessDescriptor(profile, actor) {
  const ownerUserId = toIdString(profile?.userId) || null
  const actorUserId = toIdString(actor?._id || actor?.id) || null
  const canWrite = isAdminUser(actor) || !ownerUserId || !actorUserId || ownerUserId === actorUserId

  return {
    ownerUserId,
    isAssigned: !canWrite && Boolean(ownerUserId),
    canEdit: canWrite,
  }
}

async function listProfilesByIds(profileIds, extraFilter = {}) {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(profileIds) ? profileIds : [])
        .map((value) => toIdString(value))
        .filter(Boolean)
    )
  )
  if (!normalizedIds.length) return []

  const filter = mergeMongoFilters({ _id: { $in: normalizedIds } }, extraFilter)
  return ProfileModel.find(filter).sort({ updatedAt: -1 }).lean()
}

module.exports = {
  buildProfileAccessDescriptor,
  buildReadableProfileFilterForUser,
  buildWritableProfileFilterForUser,
  getAssignedProfileIdsForUser,
  listProfilesByIds,
  mergeMongoFilters,
}
