import { useEffect, useState, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { doc, getDoc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { ChevronLeftIcon, PhotoIcon, ShareIcon } from '@heroicons/react/24/outline'
import FlashcardList from '../components/FlashcardList'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import {
  fetchFlashcardsForTopico,
  generateAndSaveFlashcardsForTopico,
} from '../services/topicoFlashcardsService'
import { generateShareToken } from '../utils/shareToken'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'

const FlashcardsTopicoView = () => {
  const { courseId: courseIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const { user, favorites, updateFavorites, profile, isAdmin } = useAuth()
  const { darkMode } = useDarkMode()

  const disciplina = decodeURIComponent(searchParams.get('disciplina') || '')
  const modulo = decodeURIComponent(searchParams.get('modulo') || '')
  const topicKey = searchParams.get('topicKey') || ''

  const courseId = courseIdParam || profile?.selectedCourseId || 'alego-default'

  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [cardProgress, setCardProgress] = useState({})
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    if (!courseId) return
    getDoc(doc(db, 'courses', courseId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setCourseName(data.name || data.competition || '')
      }
    })
  }, [courseId])

  useEffect(() => {
    if (!user || !disciplina || !modulo) {
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        let existing = await fetchFlashcardsForTopico(courseId, disciplina, modulo, topicKey)

        if (existing.length === 0) {
          setGenerating(true)
          const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
          const editalDoc = await getDoc(editalRef)
          let editalText = ''
          if (editalDoc.exists()) {
            const d = editalDoc.data()
            editalText = (d.prompt || '') + '\n\n' + (d.pdfText || '')
          }

          const topicoParts = modulo.match(/^([\d.]+)\s*[-–]\s*(.+)$/)
          const topicoNumero = topicoParts?.[1]?.trim() || ''
          const topicoNome = topicoParts?.[2]?.trim() || modulo

          existing = await generateAndSaveFlashcardsForTopico({
            courseId,
            disciplina,
            topicoNome,
            topicoNumero,
            topicKey,
            moduloLabel: modulo,
            courseName,
            editalText,
          })
          if (!cancelled) setFromCache(false)
        } else if (!cancelled) {
          setFromCache(true)
        }

        if (!cancelled) {
          setCards(existing)
          setCurrentIndex(0)
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err)
          setError(err.message || 'Erro ao carregar flashcards')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setGenerating(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user, courseId, disciplina, modulo, topicKey])

  useEffect(() => {
    if (!user) return
    const userProgressRef = doc(db, 'userProgress', user.uid)
    const unsub = onSnapshot(userProgressRef, (snapshot) => {
      if (snapshot.exists()) {
        setCardProgress(snapshot.data().cardProgress || {})
      }
    })
    return () => unsub()
  }, [user])

  const viewedIds = useMemo(
    () => cards.filter((c) => cardProgress[c.id]?.reviewCount > 0).map((c) => c.id),
    [cards, cardProgress]
  )

  const handleRate = async (cardId, difficulty) => {
    if (!user) return
    const current = cardProgress[cardId] || {}
    const now = dayjs()
    const intervalMinutes = difficulty === 'easy' ? 15 : 1
    const next = {
      ...current,
      nextReview: now.add(intervalMinutes, 'minute').toISOString(),
      reviewCount: (current.reviewCount || 0) + 1,
      lastDifficulty: difficulty,
    }
    const updated = { ...cardProgress, [cardId]: next }
    setCardProgress(updated)
    await setDoc(
      doc(db, 'userProgress', user.uid),
      { cardProgress: updated },
      { merge: true }
    )
  }

  const toggleFavorite = async (id) => {
    const next = favorites.includes(id)
      ? favorites.filter((f) => f !== id)
      : [...favorites, id]
    await updateFavorites(next)
  }

  const handleEditFlashcard = async (cardId, newPergunta, newResposta) => {
    try {
      const cardRef = doc(db, 'courses', courseId, 'flashcards', cardId)
      await setDoc(cardRef, {
        pergunta: newPergunta,
        resposta: newResposta,
        frente: newPergunta,
        verso: newResposta,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      
      // Update local state
      setCards(prev => prev.map(card => 
        card.id === cardId 
          ? { ...card, pergunta: newPergunta, resposta: newResposta, frente: newPergunta, verso: newResposta }
          : card
      ))
    } catch (error) {
      console.error('Erro ao editar flashcard:', error)
      alert('Erro ao editar flashcard. Tente novamente.')
    }
  }

  const handleDeleteFlashcard = async (cardId) => {
    try {
      const cardRef = doc(db, 'courses', courseId, 'flashcards', cardId)
      await deleteDoc(cardRef)
      
      // Update local state
      setCards(prev => prev.filter(card => card.id !== cardId))
      setCurrentIndex(0)
    } catch (error) {
      console.error('Erro ao excluir flashcard:', error)
      alert('Erro ao excluir flashcard. Tente novamente.')
    }
  }

  const openPIPMode = () => {
    const params = new URLSearchParams()
    params.set('disciplina', disciplina)
    params.set('modulo', modulo)
    params.set('topicKey', topicKey)
    
    const pipUrl = `/flashcards/pip/${courseId}?${params.toString()}`
    window.open(pipUrl, 'flashcard-pip', 'width=800,height=600,scrollbars=yes,resizable=yes')
  }

  const handleShareFlashcards = async () => {
    try {
      const token = await generateShareToken({
        courseId,
        disciplina,
        modulo,
        topicKey,
      })

      const baseUrl = window.location.origin
      const shareLink = `${baseUrl}/share-flashcards/${token}`
      
      await navigator.clipboard.writeText(shareLink)
      toast.success('Link copiado para o clipboard! Expira em 1 hora após o primeiro acesso.')
    } catch (error) {
      console.error('Erro ao gerar link:', error)
      toast.error('Erro ao gerar link de compartilhamento')
    }
  }

  if (!disciplina || !modulo) {
    return (
      <div className="min-h-screen p-6 text-center">
        <p className="text-slate-600 dark:text-slate-400 mb-4">Tópico inválido.</p>
        <Link to="/flashcards" className="text-alego-600 font-semibold">
          Voltar aos flashcards
        </Link>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <Link
              to="/edital-verticalizado"
              className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-alego-600 mb-2"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Voltar ao edital
            </Link>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{disciplina}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{modulo}</p>
            {fromCache && cards.length > 0 && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Flashcards carregados do banco (compartilhados com todos os alunos)
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={handleShareFlashcards}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-bold hover:opacity-80 transition"
                title="Gerar link temporário de compartilhamento"
              >
                <ShareIcon className="h-5 w-5" />
                <span className="hidden sm:inline">Compartilhar</span>
              </button>
            )}
            <button
              type="button"
              onClick={openPIPMode}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-bold hover:opacity-80 transition"
            >
              <PhotoIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Modo PIP</span>
            </button>
          </div>
        </div>
      </div>

      {(loading || generating) && (
        <div className="flex flex-col items-center justify-center py-24 px-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent mb-4" />
          <p className="text-slate-700 dark:text-slate-300 font-semibold">
            {generating ? 'Gerando flashcards com IA (primeira vez neste tópico)...' : 'Carregando...'}
          </p>
          <p className="text-xs text-slate-500 mt-2 text-center max-w-md">
            FlashCards específicos para o seu curso.
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="max-w-lg mx-auto mt-8 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !generating && !error && cards.length > 0 && (
        <FlashcardList
          cards={cards}
          currentIndex={currentIndex}
          onSelect={setCurrentIndex}
          onToggleFavorite={toggleFavorite}
          onRateDifficulty={handleRate}
          favorites={favorites}
          cardProgress={cardProgress}
          onPrev={() => setCurrentIndex((i) => (i - 1 < 0 ? cards.length - 1 : i - 1))}
          onNext={() => setCurrentIndex((i) => (i + 1 >= cards.length ? 0 : i + 1))}
          onShuffle={() => setCards((prev) => [...prev].sort(() => Math.random() - 0.5))}
          viewedIds={viewedIds}
          showRating
          onEditFlashcard={handleEditFlashcard}
          onDeleteFlashcard={handleDeleteFlashcard}
        />
      )}
    </div>
  )
}

export default FlashcardsTopicoView
