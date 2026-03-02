import { useState, useEffect, useRef } from 'react'
import { collection, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

export const useStudySession = (userId, currentMateria) => {
  const [sessionActive, setSessionActive] = useState(false)
  const [sessionStartTime, setSessionStartTime] = useState(null)
  const sessionRef = useRef(null)
  const inactivityTimeoutRef = useRef(null)

  // Iniciar sessão de estudo
  const startSession = async () => {
    if (!userId || !currentMateria) return

    try {
      const sessionData = {
        userId: userId,
        materia: currentMateria,
        startTime: serverTimestamp(),
        endTime: null,
        isActive: true
      }

      const sessionDocRef = doc(collection(db, 'users', userId, 'studySessions'))
      await setDoc(sessionDocRef, sessionData)
      
      sessionRef.current = sessionDocRef
      setSessionStartTime(new Date())
      setSessionActive(true)

      // Configurar timeout de inatividade (5 minutos)
      setupInactivityTimeout()
      
    } catch (error) {
      console.error('Erro ao iniciar sessão de estudo:', error)
    }
  }

  // Finalizar sessão de estudo
  const endSession = async () => {
    if (!sessionRef.current || !sessionActive) return

    try {
      await updateDoc(sessionRef.current, {
        endTime: serverTimestamp(),
        isActive: false
      })

      sessionRef.current = null
      setSessionActive(false)
      setSessionStartTime(null)
      
      // Limpar timeout de inatividade
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
        inactivityTimeoutRef.current = null
      }
      
    } catch (error) {
      console.error('Erro ao finalizar sessão de estudo:', error)
    }
  }

  // Configurar timeout de inatividade
  const setupInactivityTimeout = () => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current)
    }

    inactivityTimeoutRef.current = setTimeout(() => {
      console.log('Sessão finalizada por inatividade')
      endSession()
    }, 5 * 60 * 1000) // 5 minutos
  }

  // Resetar timeout de inatividade (quando há atividade do usuário)
  const resetInactivityTimeout = () => {
    if (sessionActive) {
      setupInactivityTimeout()
    }
  }

  // Detectar atividade do usuário
  useEffect(() => {
    const handleActivity = () => {
      resetInactivityTimeout()
    }

    // Eventos que indicam atividade
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity)
    })

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
    }
  }, [sessionActive])

  // Auto-iniciar sessão quando matéria mudar
  useEffect(() => {
    if (userId && currentMateria && !sessionActive) {
      startSession()
    }

    // Finalizar sessão ao mudar de matéria
    return () => {
      if (sessionActive) {
        endSession()
      }
    }
  }, [currentMateria, userId])

  // Finalizar sessão ao sair da página
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionActive) {
        endSession()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (sessionActive) {
        endSession()
      }
    }
  }, [sessionActive])

  // Finalizar sessão quando usuário fizer logout
  useEffect(() => {
    if (!userId && sessionActive) {
      endSession()
    }
  }, [userId])

  return {
    sessionActive,
    sessionStartTime,
    startSession,
    endSession,
    resetInactivityTimeout
  }
}
