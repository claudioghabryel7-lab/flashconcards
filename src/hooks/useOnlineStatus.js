import { isDevEnv } from '@/lib/env.js'
import { useEffect } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseInitialized, initFirebase } from '../firebase/config'
import { useAuth } from './useAuth'
import { PRESENCE_HEARTBEAT_MS } from '../utils/onlineNow'

function buildPresencePayload(user, profile, status) {
  return {
    uid: String(user.uid),
    email: String(user.email || ''),
    displayName: String(
      profile?.displayName || user.displayName || user.email || 'Usuário',
    ),
    courseId: profile?.selectedCourseId ?? null,
    status,
    lastSeen: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

// Hook para rastrear status online/offline do usuário
export const useOnlineStatus = () => {
  const { user, profile } = useAuth()

  useEffect(() => {
    initFirebase()
    if (!firebaseInitialized || !db || !user || !user.uid) return () => {}

    const userId = String(user.uid)
    if (!userId) return () => {}

    const userPresenceRef = doc(db, 'presence', userId)
    let heartbeatInterval = null

    const writePresence = async (status) => {
      try {
        await setDoc(
          userPresenceRef,
          buildPresencePayload(user, profile, status),
          { merge: true },
        )
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (isDevEnv()) {
          console.error('Erro ao atualizar presença:', errorMessage)
        }
      }
    }

    const markOnline = () => writePresence('online')
    const markOffline = () => writePresence('offline')

    const startHeartbeat = () => {
      if (heartbeatInterval) return
      heartbeatInterval = setInterval(markOnline, PRESENCE_HEARTBEAT_MS)
    }

    const stopHeartbeat = () => {
      if (!heartbeatInterval) return
      clearInterval(heartbeatInterval)
      heartbeatInterval = null
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markOnline()
        startHeartbeat()
      } else {
        stopHeartbeat()
        markOffline()
      }
    }

    const onPageHide = () => {
      stopHeartbeat()
      markOffline()
    }

    markOnline()
    startHeartbeat()

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      stopHeartbeat()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      markOffline()
    }
  }, [user, profile?.selectedCourseId, profile?.displayName])
}
