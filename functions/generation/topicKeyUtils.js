/** Sanitiza topicKey para uso como ID de documento no Firestore */
function sanitizeTopicKeyForFirestore(topicKey = '') {
  if (!topicKey) return ''

  let decoded = topicKey
  try {
    decoded = decodeURIComponent(topicKey)
  } catch {
    decoded = topicKey
  }

  let sanitized = decoded
    .replace(/::/g, '_DOUBLECOLON_')
    .replace(/\//g, '_SLASH_')
    .replace(/\\/g, '_BACKSLASH_')
    .trim()

  if (sanitized.length > 400) {
    sanitized = sanitized.substring(0, 400)
  }

  if (!sanitized || sanitized.trim() === '') {
    const hash = topicKey.split('').reduce((acc, char) => {
      return (acc << 5) - acc + char.charCodeAt(0)
    }, 0)
    return `topic_${Math.abs(hash).toString(36)}`
  }

  return sanitized
}

function normalizeTopicKeyForStorage(topicKey = '') {
  if (!topicKey) return ''

  let key = String(topicKey).trim()
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(key)
      if (decoded === key) break
      key = decoded
    } catch {
      break
    }
  }

  return key
}

function sanitizeDisciplinaKey(nome = '') {
  return (nome || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)
}

module.exports = {
  sanitizeTopicKeyForFirestore,
  normalizeTopicKeyForStorage,
  sanitizeDisciplinaKey,
}
