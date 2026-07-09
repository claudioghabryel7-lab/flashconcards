import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, firebaseInitialized, initFirebase } from '../firebase/config'
import { usePresenceRegistry } from './usePresenceRegistry'
import {
  getSimulatedOnlineCount,
  normalizeOnlineDisplay,
} from '../utils/simulatedOnline'

/**
 * Contagem de online por curso — respeita config do admin (real vs simulado).
 */
export function useCourseOnlineDisplay({ courseId = null, platformWide = false } = {}) {
  const { onlineCount, loading: presenceLoading, now } = usePresenceRegistry({
    courseId: platformWide ? null : courseId,
    platformWide,
  })

  const [displayConfig, setDisplayConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(Boolean(courseId && !platformWide))

  useEffect(() => {
    if (platformWide || !courseId) {
      setDisplayConfig(null)
      setConfigLoading(false)
      return () => {}
    }

    initFirebase()
    if (!firebaseInitialized || !db) {
      setConfigLoading(false)
      return () => {}
    }

    setConfigLoading(true)
    const unsubscribe = onSnapshot(
      doc(db, 'courses', courseId),
      (snap) => {
        const data = snap.data() || {}
        setDisplayConfig(normalizeOnlineDisplay(data.onlineDisplay))
        setConfigLoading(false)
      },
      () => {
        setDisplayConfig(normalizeOnlineDisplay(null))
        setConfigLoading(false)
      },
    )

    return () => unsubscribe()
  }, [courseId, platformWide])

  const isSimulated = !platformWide && displayConfig?.mode === 'simulated'

  const count = useMemo(() => {
    if (platformWide || !isSimulated || !courseId) return onlineCount
    return getSimulatedOnlineCount(courseId, displayConfig, now)
  }, [platformWide, isSimulated, courseId, displayConfig, onlineCount, now])

  return {
    count,
    onlineCount,
    loading: presenceLoading || configLoading,
    isSimulated,
    displayConfig,
    now,
  }
}
