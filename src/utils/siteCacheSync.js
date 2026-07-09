export const SITE_CACHE_VERSION_KEY = 'flashconcards_site_cache_version'

export async function clearClientCaches() {
  try {
    if ('caches' in window) {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))
    }
  } catch (err) {
    console.warn('Erro ao limpar Cache API:', err)
  }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        registrations.map(async (registration) => {
          try {
            if (registration.active) {
              const channel = new MessageChannel()
              await new Promise((resolve) => {
                const timeout = setTimeout(resolve, 1500)
                channel.port1.onmessage = () => {
                  clearTimeout(timeout)
                  resolve(undefined)
                }
                registration.active.postMessage({ type: 'CLEAR_CACHE' }, [channel.port2])
              })
            }
            await registration.unregister()
          } catch {
            // seguir com outras registrations
          }
        }),
      )
    }
  } catch (err) {
    console.warn('Erro ao limpar service workers:', err)
  }
}

export function hardReloadSite() {
  const url = new URL(window.location.href)
  url.searchParams.set('_cv', String(Date.now()))
  window.location.replace(url.toString())
}

export async function applySiteCacheRefresh(serverVersion) {
  if (!serverVersion || typeof window === 'undefined') return

  const version = Number(serverVersion)
  if (!Number.isFinite(version) || version <= 0) return

  localStorage.setItem(SITE_CACHE_VERSION_KEY, String(version))
  await clearClientCaches()
  hardReloadSite()
}
