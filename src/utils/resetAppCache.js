/**
 * Limpa caches do app (Cache Storage, Service Worker e localStorage de dados)
 * para forçar o carregamento da versão mais recente após deploy/atualizações.
 */

const PRESERVE_LOCAL_STORAGE_PREFIXES = [
  'firebase:authUser',
  'firebase:host',
]

function shouldPreserveLocalStorageKey(key = '') {
  return PRESERVE_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
}

async function clearCacheStorage() {
  if (!('caches' in window)) return { cleared: 0 }
  const names = await caches.keys()
  await Promise.all(names.map((name) => caches.delete(name)))
  return { cleared: names.length }
}

async function unregisterServiceWorkers() {
  if (!('serviceWorker' in navigator)) return { unregistered: 0 }
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((reg) => reg.unregister()))
  return { unregistered: registrations.length }
}

function clearAppLocalStorage() {
  const keysToRemove = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key) continue
    if (shouldPreserveLocalStorageKey(key)) continue
    // Limpa caches do app (firebase_cache_*, sw flags, etc.) e mantém autenticação
    if (
      key.startsWith('firebase_cache_') ||
      key.startsWith('sw_') ||
      key === 'sw_cache_cleaned' ||
      key.includes('cache') ||
      key.includes('Cache')
    ) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key))
  try {
    sessionStorage.removeItem('sw_cache_cleaned')
  } catch {
    /* ignore */
  }
  return { cleared: keysToRemove.length }
}

async function askServiceWorkerToClear() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    return { sent: false }
  }

  return new Promise((resolve) => {
    try {
      const channel = new MessageChannel()
      const timeout = setTimeout(() => resolve({ sent: true, timedOut: true }), 2500)
      channel.port1.onmessage = () => {
        clearTimeout(timeout)
        resolve({ sent: true, timedOut: false })
      }
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' }, [channel.port2])
    } catch {
      resolve({ sent: false })
    }
  })
}

/**
 * Reseta caches e (por padrão) recarrega a página com cache-bust.
 * @param {{ reload?: boolean }} options
 */
export async function resetAppCache({ reload = true } = {}) {
  const swMessage = await askServiceWorkerToClear()
  const cacheStorage = await clearCacheStorage()
  const serviceWorkers = await unregisterServiceWorkers()
  const local = clearAppLocalStorage()

  // Também usa o helper global do index.html, se existir
  if (typeof window.clearServiceWorkerCache === 'function' && !reload) {
    try {
      await window.clearServiceWorkerCache()
    } catch {
      /* ignore */
    }
  }

  const result = {
    ok: true,
    swMessage,
    cacheStorage,
    serviceWorkers,
    local,
  }

  if (reload) {
    const url = new URL(window.location.href)
    url.searchParams.set('_cache_bust', String(Date.now()))
    window.location.replace(url.toString())
  }

  return result
}
