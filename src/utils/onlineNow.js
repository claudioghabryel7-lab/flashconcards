/** Presença considerada "online" se atualizada nos últimos 45s (3× heartbeat de 15s). */
export function isPresenceFresh(lastSeen, now = Date.now()) {
  if (!lastSeen) return false

  try {
    const millis =
      typeof lastSeen?.toMillis === 'function'
        ? lastSeen.toMillis()
        : lastSeen instanceof Date
          ? lastSeen.getTime()
          : null

    if (!millis) return false
    return now - millis <= 45_000
  } catch {
    return false
  }
}
