import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db, firebaseInitialized, initFirebase } from '../firebase/config'
import {
  countOnlineFromEntries,
  isPresenceOnline,
  PRESENCE_HEARTBEAT_MS,
} from '../utils/onlineNow'

/**
 * Fonte única de presença em tempo real.
 * @param {{ courseId?: string | null, platformWide?: boolean }} options
 * - platformWide: true = conta todos os alunos online na plataforma (mesmo número para todos)
 * - courseId: filtra por curso (páginas de curso/marketing)
 */
export function usePresenceRegistry({ courseId = null, platformWide = false } = {}) {
  const [entries, setEntries] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const filterCourseId = platformWide ? null : courseId

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), PRESENCE_HEARTBEAT_MS)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    initFirebase()
    if (!firebaseInitialized || !db) {
      setLoading(false)
      return () => {}
    }

    const unsubscribe = onSnapshot(
      collection(db, 'presence'),
      (snapshot) => {
        const map = {}
        snapshot.forEach((docSnap) => {
          map[docSnap.id] = { uid: docSnap.id, ...docSnap.data() }
        })
        setEntries(map)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  const onlineCount = useMemo(
    () => countOnlineFromEntries(entries, { courseId: filterCourseId, now }),
    [entries, filterCourseId, now],
  )

  const isOnline = useCallback(
    (uid) => isPresenceOnline(entries[uid], now),
    [entries, now],
  )

  return { entries, onlineCount, isOnline, loading, error, now }
}

/** @deprecated use usePresenceRegistry */
export function useCourseOnlineCount(courseId, options = {}) {
  const platformWide = options.platformWide === true || courseId == null
  const { onlineCount, loading, error } = usePresenceRegistry({
    courseId,
    platformWide,
  })
  return { count: onlineCount, loading, error }
}
