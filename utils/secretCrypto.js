const crypto = require('crypto')

const ENCRYPTION_PREFIX = 'enc:v1'
const AES_MODE = 'aes-256-gcm'

function normalizeSecret(value) {
  return String(value || '').trim()
}

function getEncryptionSecret() {
  const configured = normalizeSecret(
    process.env.ADMIN_CONFIGURATION_ENCRYPTION_KEY || process.env.ADMIN_CONFIG_ENCRYPTION_KEY
  )
  if (configured) return configured

  const jwtSecret = normalizeSecret(process.env.JWT_SECRET || process.env.JWT_SECRET_KEY)
  if (jwtSecret) return jwtSecret

  return ''
}

function getEncryptionKeyBuffer() {
  const secret = getEncryptionSecret()
  if (!secret) return null
  return crypto.createHash('sha256').update(secret).digest()
}

function encryptSecret(plainText) {
  const normalized = normalizeSecret(plainText)
  if (!normalized) return ''

  const key = getEncryptionKeyBuffer()
  if (!key) {
    throw new Error(
      'Missing encryption secret. Set ADMIN_CONFIGURATION_ENCRYPTION_KEY or JWT_SECRET.'
    )
  }

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(AES_MODE, key, iv)
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${ENCRYPTION_PREFIX}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

function decryptSecret(cipherText) {
  const raw = String(cipherText || '').trim()
  if (!raw) return ''

  if (!raw.startsWith(`${ENCRYPTION_PREFIX}:`)) {
    return raw
  }

  const key = getEncryptionKeyBuffer()
  if (!key) {
    throw new Error(
      'Missing encryption secret. Set ADMIN_CONFIGURATION_ENCRYPTION_KEY or JWT_SECRET.'
    )
  }

  const parts = raw.split(':')
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted secret format')
  }

  const iv = Buffer.from(parts[2], 'base64')
  const authTag = Buffer.from(parts[3], 'base64')
  const encrypted = Buffer.from(parts[4], 'base64')

  const decipher = crypto.createDecipheriv(AES_MODE, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

module.exports = {
  decryptSecret,
  encryptSecret,
}
