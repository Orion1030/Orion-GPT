function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function formatProfileDisplayName(profile, fallback = '') {
  if (!profile || typeof profile !== 'object') {
    return cleanText(fallback)
  }

  const fullName = cleanText(profile.fullName || profile.name)
  const mainStack = cleanText(profile.mainStack)
  const fallbackText = cleanText(fallback)
  const base = fullName || fallbackText || cleanText(profile.title)

  if (!base) return ''
  if (!mainStack) return base
  if (base.toLowerCase().includes(` - ${mainStack.toLowerCase()}`)) return base
  return `${base} - ${mainStack}`
}

module.exports = {
  formatProfileDisplayName,
}
