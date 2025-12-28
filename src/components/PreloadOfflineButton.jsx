import { useState } from 'react'
import { ArrowDownTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'

const PreloadOfflineButton = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' })
  const [completed, setCompleted] = useState(false)

  const handlePreload = async () => {
    if (!user || !profile) return
    if (!navigator.onLine) {
      alert('Você precisa estar online para carregar dados para uso offline.')
      return
    }

    setLoading(true)
    setCompleted(false)
    setProgress({ current: 0, total: 0, message: 'Preparando...' })

    try {
      const selectedCourseId = profile.selectedCourseId || 'alego'
      const cacheKey = `flashcards_${selectedCourseId}_${user.uid}`
      
      // 1. Carregar flashcards
      setProgress({ current: 1, total: 4, message: 'Carregando flashcards...' })
      const cardsRef = collection(db, 'flashcards')
      const cardsSnapshot = await getDocs(cardsRef)
      const allCards = cardsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))

      // Filtrar por curso
      const courseId = selectedCourseId === 'alego-default' ? null : selectedCourseId
      const filteredCards = courseId
        ? allCards.filter((card) => card.courseId === courseId)
        : allCards.filter((card) => !card.courseId || card.courseId === '' || card.courseId === 'alego-default')

      // Salvar flashcards no cache
      localStorage.setItem(
        `firebase_cache_${cacheKey}`,
        JSON.stringify({
          data: filteredCards,
          timestamp: Date.now(),
        })
      )

      // 2. Carregar progresso do usuário
      setProgress({ current: 2, total: 4, message: 'Carregando seu progresso...' })
      const { doc: docFn, getDoc } = await import('firebase/firestore')
      const userProgressRef = docFn(db, 'userProgress', user.uid)
      const userProgressDoc = await getDoc(userProgressRef)
      
      if (userProgressDoc.exists()) {
        const progressData = userProgressDoc.data()
        localStorage.setItem(
          `firebase_cache_userProgress_${user.uid}`,
          JSON.stringify({
            data: progressData,
            timestamp: Date.now(),
          })
        )
      }

      // 3. Carregar cursos
      setProgress({ current: 3, total: 4, message: 'Carregando cursos...' })
      const coursesRef = collection(db, 'courses')
      const coursesSnapshot = await getDocs(coursesRef)
      const courses = coursesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      
      localStorage.setItem(
        `firebase_cache_courses`,
        JSON.stringify({
          data: courses,
          timestamp: Date.now(),
        })
      )

      // 4. Carregar perfil do usuário (já está carregado, só garantir cache)
      setProgress({ current: 4, total: 4, message: 'Finalizando...' })
      if (profile) {
        localStorage.setItem(
          `firebase_cache_users_${user.uid}`,
          JSON.stringify({
            data: profile,
            timestamp: Date.now(),
          })
        )
      }

      setCompleted(true)
      setProgress({ current: 4, total: 4, message: 'Concluído! Agora você pode usar offline.' })
      
      // Remover mensagem de sucesso após 3 segundos
      setTimeout(() => {
        setCompleted(false)
        setLoading(false)
      }, 3000)
    } catch (error) {
      console.error('Erro ao preparar dados offline:', error)
      alert('Erro ao carregar dados. Verifique sua conexão e tente novamente.')
      setLoading(false)
    }
  }

  // Não mostrar se estiver offline ou não tiver usuário
  if (!user || !profile || !navigator.onLine) {
    return null
  }

  // Não mostrar se já completou recentemente
  if (completed) {
    return (
      <button
        disabled
        className={`
          w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium
          transition-all
          ${darkMode
            ? 'bg-green-600/20 text-green-400 border border-green-600/50'
            : 'bg-green-50 text-green-700 border border-green-200'
          }
        `}
      >
        <CheckCircleIcon className="h-5 w-5" />
        <span>{progress.message}</span>
      </button>
    )
  }

  return (
    <button
      onClick={handlePreload}
      disabled={loading}
      className={`
        w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium
        transition-all shadow hover:shadow-md
        ${loading
          ? 'opacity-75 cursor-not-allowed'
          : 'hover:scale-[1.02]'
        }
        ${darkMode
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-blue-600 text-white hover:bg-blue-700'
        }
      `}
    >
      {loading ? (
        <>
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
          <span>{progress.message} ({progress.current}/{progress.total})</span>
        </>
      ) : (
        <>
          <ArrowDownTrayIcon className="h-5 w-5" />
          <span>Carregar Tudo para Usar Offline</span>
        </>
      )}
    </button>
  )
}

export default PreloadOfflineButton

