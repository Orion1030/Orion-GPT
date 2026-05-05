const crypto = require('crypto')
const { getJwtSecret } = require('../utils')

const TOKEN_VERSION = 'v1'
const DEFAULT_TTL_MS = 10 * 60 * 1000

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ''), 'base64url')
}

function getEncryptionKey() {
  const tokenSecret = process.env.AI_CHAT_EDGE_TOKEN_SECRET || getJwtSecret()
  return crypto
    .createHash('sha256')
    .update(tokenSecret)
    .digest()
}

function createTurnToken(payload, options = {}) {
  const now = Date.now()
  const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DEFAULT_TTL_MS
  const body = {
    ...payload,
    version: TOKEN_VERSION,
    issuedAt: now,
    expiresAt: now + ttlMs,
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(body), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    TOKEN_VERSION,
    toBase64Url(iv),
    toBase64Url(tag),
    toBase64Url(ciphertext),
  ].join('.')
}

function createContextToken(payload, options = {}) {
  return createTurnToken({
    ...payload,
    tokenType: 'ai-chat-context',
  }, options)
}

function createTokenError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function readTurnToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw createTokenError('Turn token is required', 400)
  }

  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    throw createTokenError('Invalid turn token', 400)
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      fromBase64Url(parts[1])
    )
    decipher.setAuthTag(fromBase64Url(parts[2]))
    const plaintext = Buffer.concat([
      decipher.update(fromBase64Url(parts[3])),
      decipher.final(),
    ]).toString('utf8')
    const payload = JSON.parse(plaintext)

    if (payload.version !== TOKEN_VERSION) {
      throw createTokenError('Invalid turn token', 400)
    }
    if (!payload.expiresAt || Date.now() > Number(payload.expiresAt)) {
      throw createTokenError('Turn token expired', 401)
    }

    return payload
  } catch (error) {
    if (error.statusCode) throw error
    throw createTokenError('Invalid turn token', 400)
  }
}

module.exports = {
  createContextToken,
  createTurnToken,
  readTurnToken,
}
