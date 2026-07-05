/** Sanitiza topicKey para uso como ID de documento no Firestore */
export function sanitizeTopicKeyForFirestore(topicKey = '') {
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
