import { useEffect } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseInitialized, initFirebase } from '../firebase/config'
import { useAuth } from './useAuth'
import { isDevEnv } from '../lib/env.js'

// Hook para rastrear status online/offline do usuário
export const useOnlineStatus = () => {
  const { user } = useAuth()

  useEffect(() => {
    initFirebase()
    if (!firebaseInitialized || !db || !user || !user.uid) return

    // Garantir que uid é uma string
    const userId = String(user.uid)
    if (!userId) return

    const userPresenceRef = doc(db, 'presence', userId)

    // Marcar como online imediatamente
    const setOnline = async () => {
      try {
        await setDoc(userPresenceRef, {
          uid: userId,
          email: String(user.email || ''),
          displayName: String(user.displayName || user.email || 'Usuário'),
          status: 'online',
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
        
        // Log removido para limpar o console
      } catch (err) {
        // Garantir que o erro seja convertido para string antes de logar
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (isDevEnv()) {
          console.error('Erro ao atualizar status online:', errorMessage)
        }
      }
    }

    // Atualizar imediatamente
    setOnline()
    
    // Atualizar heartbeat a cada 15 segundos (mais frequente para melhor sincronização)
    const heartbeatInterval = setInterval(() => {
      setDoc(userPresenceRef, {
        status: 'online',
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(err => {
        // Garantir que o erro seja convertido para string antes de logar
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (import.meta.env.DEV) {
          console.error('Erro no heartbeat:', errorMessage)
        }
      })
    }, 15000) // 15 segundos

    // Cleanup - marcar como offline ao desmontar
    return () => {
      clearInterval(heartbeatInterval)
      // Marcar como offline ao desmontar
      setDoc(userPresenceRef, {
        status: 'offline',
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {
        // Silenciosamente ignorar erros no cleanup
      })
    }
  }, [user])
}

