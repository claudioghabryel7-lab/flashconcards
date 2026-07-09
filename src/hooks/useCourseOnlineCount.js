import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db, firebaseInitialized, initFirebase } from '../firebase/config'
import { isPresenceFresh } from '../utils/onlineNow'

export function useCourseOnlineCount(courseId) {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

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
        let online = 0

        snapshot.forEach((docSnap) => {
          const data = docSnap.data()
          if (courseId && data.courseId !== courseId) return
          if (data.status !== 'online') return
          if (!isPresenceFresh(data.lastSeen || data.updatedAt, now)) return
          online += 1
        })

        setCount(online)
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [courseId])

  return { count, loading }
}
