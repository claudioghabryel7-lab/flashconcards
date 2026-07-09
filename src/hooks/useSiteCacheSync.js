import { useEffect, useRef } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db, initFirebase } from '../firebase/config'
import {
  SITE_CACHE_VERSION_KEY,
  applySiteCacheRefresh,
} from '../utils/siteCacheSync'

const POLL_MS = 45000

function snapshotExists(snapshot) {
  return typeof snapshot?.exists === 'function' ? snapshot.exists() : Boolean(snapshot?.exists)
}

async function readPlatformCacheVersion() {
  initFirebase()
  if (!db) return null

  try {
    const snapshot = await getDoc(doc(db, 'siteSettings', 'platform'))
    if (!snapshotExists(snapshot)) return null
    const version = Number(snapshot.data()?.cacheVersion || 0)
    return Number.isFinite(version) && version > 0 ? version : null
  } catch (err) {
    if (err?.code !== 'permission-denied') {
      console.warn('siteCacheSync:', err.message)
    }
    return null
  }
}

function handleVersion(serverVersion, applyingRef) {
  if (!serverVersion || applyingRef.current) return

  const localVersion = Number(localStorage.getItem(SITE_CACHE_VERSION_KEY) || 0)

  if (!localVersion) {
    localStorage.setItem(SITE_CACHE_VERSION_KEY, String(serverVersion))
    return
  }

  if (serverVersion > localVersion) {
    applyingRef.current = true
    applySiteCacheRefresh(serverVersion).catch((err) => {
      console.error('Erro ao aplicar atualização de cache:', err)
      applyingRef.current = false
    })
  }
}

export default function useSiteCacheSync() {
  const applyingRef = useRef(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let cancelled = false

    const check = async () => {
      if (cancelled) return
      const version = await readPlatformCacheVersion()
      if (cancelled || version == null) return
      handleVersion(version, applyingRef)
    }

    check()
    intervalRef.current = window.setInterval(check, POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      if (intervalRef.current) window.clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}

export { readPlatformCacheVersion }
