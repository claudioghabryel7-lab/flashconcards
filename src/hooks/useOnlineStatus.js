import { useEffect } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from './useAuth'

// Hook para rastrear status online/offline do usuário
export const useOnlineStatus = () => {
  const { user } = useAuth()

  useEffect(() => {
    if (!user || !user.uid) return

    const userPresenceRef = doc(db, 'presence', user.uid)

    // Marcar como online
    const setOnline = async () => {
      try {
        await setDoc(userPresenceRef, {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email || 'Usuário',
          status: 'online',
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      } catch (err) {
        console.error('Erro ao atualizar status online:', err)
      }
    }

    // Atualizar heartbeat a cada 30 segundos
    setOnline()
    const heartbeatInterval = setInterval(() => {
      setDoc(userPresenceRef, {
        status: 'online',
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(err => {
        console.error('Erro no heartbeat:', err)
      })
    }, 30000) // 30 segundos

    // Cleanup - marcar como offline ao desmontar
    return () => {
      clearInterval(heartbeatInterval)
      // Marcar como offline ao desmontar
      setDoc(userPresenceRef, {
        status: 'offline',
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {})
    }
  }, [user])
}

