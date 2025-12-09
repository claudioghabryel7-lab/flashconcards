import { useEffect, useRef, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../firebase/config'

/**
 * Hook para rastrear tempo de estudo em tempo real
 * Salva automaticamente no Firestore a cada 10 segundos para sincronização
 */
export const useStudyTimer = (isActive, userId, courseId = null) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const startTimeRef = useRef(null)
  const intervalRef = useRef(null)
  const lastSaveRef = useRef(null)

  // Iniciar timer quando isActive muda para true
  useEffect(() => {
    if (!isActive || !userId) {
      // Parar timer e salvar horas finais antes de parar
      if (startTimeRef.current && lastSaveRef.current) {
        const saveFinalTime = async () => {
          try {
            const now = Date.now()
            const elapsedSeconds = Math.floor((now - lastSaveRef.current) / 1000)
            
            if (elapsedSeconds > 0) {
              const todayKey = dayjs().format('YYYY-MM-DD')
              const courseKey = courseId || 'alego'
              const progressDoc = doc(db, 'progress', `${userId}_${courseKey}_${todayKey}`)
              
              const existing = await getDoc(progressDoc)
              const currentHours = existing.exists() ? (existing.data().hours || 0) : 0
              const newHours = currentHours + (elapsedSeconds / 3600)
              
              await setDoc(
                progressDoc,
                {
                  uid: userId,
                  date: todayKey,
                  hours: newHours,
                  courseId: courseId || null,
                  lastUpdated: dayjs().format('HH:mm:ss'),
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              )
            }
          } catch (err) {
            console.error('Erro ao salvar tempo final:', err)
          }
        }
        saveFinalTime()
      }
      
      // Parar timer
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      startTimeRef.current = null
      lastSaveRef.current = null
      return
    }

    // Iniciar timer
    startTimeRef.current = Date.now()
    lastSaveRef.current = Date.now()

    // Atualizar a cada segundo
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setElapsedSeconds(elapsed)
      }
    }, 1000)

    // Salvar no Firestore a cada 10 segundos para sincronização em tempo real
    const saveInterval = setInterval(async () => {
      if (startTimeRef.current && userId && lastSaveRef.current) {
        try {
          const now = Date.now()
          const elapsedSeconds = Math.floor((now - lastSaveRef.current) / 1000)
          
          // Salvar mesmo que seja menos de 1 minuto, para sincronização em tempo real
          if (elapsedSeconds > 0) {
            const todayKey = dayjs().format('YYYY-MM-DD')
            // Incluir courseId no ID do documento para separar por curso
            const courseKey = courseId || 'alego'
            const progressDoc = doc(db, 'progress', `${userId}_${courseKey}_${todayKey}`)
            
            const existing = await getDoc(progressDoc)
            const currentHours = existing.exists() ? (existing.data().hours || 0) : 0
            // Adicionar segundos como horas (elapsedSeconds / 3600)
            const newHours = currentHours + (elapsedSeconds / 3600)
            
            await setDoc(
              progressDoc,
              {
                uid: userId,
                date: todayKey,
                hours: newHours,
                courseId: courseId || null, // null para ALEGO padrão
                lastUpdated: dayjs().format('HH:mm:ss'),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            )
            
            // Atualizar lastSaveRef para contar apenas o tempo novo
            lastSaveRef.current = now
          }
        } catch (err) {
          console.error('Erro ao salvar tempo de estudo:', err)
        }
      }
    }, 10000) // Salvar a cada 10 segundos para sincronização em tempo real

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      clearInterval(saveInterval)
    }
  }, [isActive, userId, courseId])


  // Formatar tempo decorrido
  const formattedTime = () => {
    const hours = Math.floor(elapsedSeconds / 3600)
    const minutes = Math.floor((elapsedSeconds % 3600) / 60)
    const seconds = elapsedSeconds % 60
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    } else {
      return `${seconds}s`
    }
  }

  return {
    elapsedSeconds,
    formattedTime: formattedTime(),
    isActive: isActive && !!userId,
  }
}

