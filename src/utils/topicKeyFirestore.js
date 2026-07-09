/** Garante ID seguro para referência Firestore (sem barras nem segmentos inválidos). */
export function toSafeFirestoreDocId(rawId = '') {
  if (!rawId?.trim()) return ''
  const sanitized = sanitizeTopicKeyForFirestore(normalizeTopicKeyForStorage(rawId))
  if (!sanitized) return ''
  if (sanitized.includes('/') || sanitized.includes('\\')) return ''
  return sanitized
}

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

/** Chave canônica do tópico para armazenar/comparar (sempre decodificada: "4 :: Nome do tópico") */
export function normalizeTopicKeyForStorage(topicKey = '') {
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
