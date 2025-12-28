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
      setProgress({ current: 1, total: 3, message: 'Carregando flashcards...' })
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

      // Salvar flashcards no cache (com verificação de quota)
      try {
        // Comprimir dados removendo campos desnecessários para economizar espaço
        const compressedCards = filteredCards.map(card => ({
          id: card.id,
          pergunta: card.pergunta,
          resposta: card.resposta,
          materia: card.materia,
          modulo: card.modulo,
          courseId: card.courseId,
          // Remover campos grandes que não são essenciais para estudo offline
          // explicacaoAI, exemplos, referencias, etc. podem ser omitidos se muito grandes
        }))
        
        localStorage.setItem(
          `firebase_cache_${cacheKey}`,
          JSON.stringify({
            data: compressedCards,
            timestamp: Date.now(),
          })
        )
      } catch (err) {
        if (err.name === 'QuotaExceededError') {
          // Se ainda exceder, tentar salvar apenas IDs e dados essenciais
          console.warn('Quota excedida ao salvar flashcards completos. Tentando versão compacta...')
          try {
            const minimalCards = filteredCards.map(card => ({
              id: card.id,
              pergunta: card.pergunta?.substring(0, 500), // Limitar tamanho
              resposta: card.resposta?.substring(0, 500), // Limitar tamanho
              materia: card.materia,
              modulo: card.modulo,
              courseId: card.courseId,
            }))
            localStorage.setItem(
              `firebase_cache_${cacheKey}`,
              JSON.stringify({
                data: minimalCards,
                timestamp: Date.now(),
              })
            )
            alert('Dados salvos em versão compacta devido ao limite de armazenamento. Alguns campos podem ter sido truncados.')
          } catch (err2) {
            console.error('Não foi possível salvar flashcards no cache:', err2)
            alert('Erro: Não foi possível salvar todos os dados. O dispositivo pode estar com pouco espaço. Tente limpar o cache do navegador.')
            throw err2
          }
        } else {
          throw err
        }
      }

      // 2. Carregar progresso do usuário (apenas progresso dos cards do curso selecionado)
      setProgress({ current: 2, total: 3, message: 'Carregando seu progresso...' })
      const { doc: docFn, getDoc } = await import('firebase/firestore')
      const userProgressRef = docFn(db, 'userProgress', user.uid)
      const userProgressDoc = await getDoc(userProgressRef)
      
      if (userProgressDoc.exists()) {
        const progressData = userProgressDoc.data()
        // Filtrar apenas progresso dos cards do curso selecionado para economizar espaço
        const cardProgress = progressData.cardProgress || {}
        const filteredProgress = {}
        
        // Obter IDs dos cards do curso selecionado
        const cardIds = new Set(filteredCards.map(card => card.id))
        
        // Manter apenas progresso dos cards do curso
        Object.keys(cardProgress).forEach(cardId => {
          if (cardIds.has(cardId)) {
            filteredProgress[cardId] = cardProgress[cardId]
          }
        })
        
        // Salvar apenas progresso filtrado
        const filteredProgressData = {
          ...progressData,
          cardProgress: filteredProgress
        }
        
        try {
          localStorage.setItem(
            `firebase_cache_userProgress_${user.uid}`,
            JSON.stringify({
              data: filteredProgressData,
              timestamp: Date.now(),
            })
          )
        } catch (err) {
          console.warn('Não foi possível salvar progresso completo no cache (quota):', err)
          // Tentar salvar apenas progresso dos cards (mais leve)
          try {
            localStorage.setItem(
              `firebase_cache_userProgress_${user.uid}`,
              JSON.stringify({
                data: { cardProgress: filteredProgress },
                timestamp: Date.now(),
              })
            )
          } catch (err2) {
            console.warn('Não foi possível salvar progresso no cache:', err2)
          }
        }
      }

      // 3. Carregar perfil do usuário (já está carregado, só garantir cache)
      // Não salvar todos os dados do perfil, apenas o essencial para evitar quota
      setProgress({ current: 3, total: 3, message: 'Finalizando...' })
      if (profile) {
        // Salvar apenas dados essenciais do perfil (evitar quota excedida)
        const essentialProfile = {
          uid: profile.uid,
          email: profile.email,
          displayName: profile.displayName,
          selectedCourseId: profile.selectedCourseId,
          purchasedCourses: profile.purchasedCourses,
          role: profile.role,
        }
        try {
          localStorage.setItem(
            `firebase_cache_users_${user.uid}`,
            JSON.stringify({
              data: essentialProfile,
              timestamp: Date.now(),
            })
          )
        } catch (err) {
          console.warn('Não foi possível salvar perfil no cache (quota):', err)
        }
      }

      setCompleted(true)
      setProgress({ current: 3, total: 3, message: 'Concluído! Agora você pode usar offline.' })
      
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

