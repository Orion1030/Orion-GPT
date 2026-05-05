function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`)
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
}

module.exports = {
  assertArray,
  assertObject,
  isObject,
}
