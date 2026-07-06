import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db, firebaseInitialized, initFirebase } from '../firebase/config'
import { isPresenceFresh, resolveDisplayedOnlineCount } from '../utils/onlineNow'

export function useCourseOnlineCount(courseId, options = {}) {
  const { fallbackSeed = courseId || 'global' } = options
  const [realCount, setRealCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000)
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
        const now = Date.now()
        let count = 0

        snapshot.forEach((docSnap) => {
          const data = docSnap.data()
          if (courseId && data.courseId !== courseId) return
          if (data.status !== 'online') return
          if (!isPresenceFresh(data.lastSeen || data.updatedAt, now)) return
          count += 1
        })

        setRealCount(count)
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [courseId])

  const displayCount = useMemo(
    () => resolveDisplayedOnlineCount(realCount, fallbackSeed, now),
    [fallbackSeed, realCount, now],
  )

  return {
    realCount,
    displayCount,
    loading,
    usesRealCount: realCount > 10,
  }
}
