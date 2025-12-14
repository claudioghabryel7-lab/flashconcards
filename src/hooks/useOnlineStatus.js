import { useEffect } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseInitialized } from '../firebase/config'
import { useAuth } from './useAuth'

// Hook para rastrear status online/offline do usuário
export const useOnlineStatus = () => {
  const { user } = useAuth()

  useEffect(() => {
    // Verificar se Firebase está inicializado e user tem uid válido
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
        
        // Log apenas em desenvolvimento e garantindo string primitiva
        if (import.meta.env.DEV) {
          console.log('Status online atualizado para:', userId)
        }
      } catch (err) {
        // Garantir que o erro seja convertido para string antes de logar
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (import.meta.env.DEV) {
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

