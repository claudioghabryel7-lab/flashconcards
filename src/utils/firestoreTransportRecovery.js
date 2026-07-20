/**
 * Recuperação de conexão Firestore: limpa SW/PWA legados e IndexedDB corrompido.
 * ERR_SSL_PROTOCOL_ERROR no canal Listen costuma ser rede/IPv6/SW antigo.
 */

const CLEANUP_FLAG = 'fcc_firestore_transport_cleanup_v2'

export async function purgeStaleServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(
    registrations.map(async (registration) => {
      const scriptUrl =
        registration.active?.scriptURL ||
        registration.waiting?.scriptURL ||
        registration.installing?.scriptURL ||
        ''
      // Mantém só o SW de push; remove PWA sw.js legado que intercepta fetch
      if (!scriptUrl.includes('firebase-messaging-sw.js')) {
        try {
          await registration.unregister()
        } catch {
          // ignore
        }
      }
    }),
  )
}

export async function purgeFirestoreIndexedDb() {
  if (typeof window === 'undefined' || !window.indexedDB?.databases) return

  try {
    const dbs = await window.indexedDB.databases()
    await Promise.all(
      (dbs || []).map(async (entry) => {
        const name = String(entry?.name || '')
        if (!name.toLowerCase().includes('firestore')) return
        await new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(name)
          req.onsuccess = () => resolve(undefined)
          req.onerror = () => resolve(undefined)
          req.onblocked = () => resolve(undefined)
        })
      }),
    )
  } catch {
    // browsers antigos sem indexedDB.databases()
  }
}

export async function ensureFirestoreTransportRecovery({ force = false } = {}) {
  if (typeof window === 'undefined') return { cleaned: false }

  if (!force && localStorage.getItem(CLEANUP_FLAG) === '1') {
    return { cleaned: false }
  }

  await purgeStaleServiceWorkers()
  await purgeFirestoreIndexedDb()

  try {
    if ('caches' in window) {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => /flashconcards|workbox|runtime/i.test(name))
          .map((name) => caches.delete(name)),
      )
    }
  } catch {
    // ignore
  }

  localStorage.setItem(CLEANUP_FLAG, '1')
  return { cleaned: true }
}

/**
 * Probe leve: se HTTPS ao host do Firestore falhar, a rede/IPv6/proxy está quebrada.
 */
export async function probeFirestoreHost() {
  if (typeof window === 'undefined') return { ok: false, reason: 'ssr' }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch('https://firestore.googleapis.com/', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timer)
    // no-cors → opaque; se chegou aqui, o handshake SSL concluiu
    return { ok: true, type: res.type }
  } catch (error) {
    return {
      ok: false,
      reason: String(error?.message || error || 'fetch_failed'),
    }
  }
}
