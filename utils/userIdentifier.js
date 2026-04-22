const USER_IDENTIFIER_REGEX = /^[A-Z0-9][A-Z0-9_-]{2,31}$/

function buildDefaultUserIdentifierFromObjectId(value) {
  const objectIdString = String(value || '').trim()
  const suffix = objectIdString ? objectIdString.toUpperCase() : 'UNKNOWN'
  return `USR-${suffix}`
}

function normalizeUserIdentifier(value) {
  return String(value || '').trim().toUpperCase()
}

function isValidUserIdentifier(value) {
  return USER_IDENTIFIER_REGEX.test(String(value || '').trim())
}

module.exports = {
  USER_IDENTIFIER_REGEX,
  buildDefaultUserIdentifierFromObjectId,
  normalizeUserIdentifier,
  isValidUserIdentifier,
}
