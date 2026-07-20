import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { saveFlashcardContent, deleteFlashcardContent } from '../utils/flashcardPersistence'
import { ChevronLeftIcon, PhotoIcon, ShareIcon } from '@heroicons/react/24/outline'
import FlashcardList from '../components/FlashcardList'
import ContentPublishButton from '../components/ContentPublishButton'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useSRSDeck } from '../hooks/useSRSDeck'
import {
  fetchFlashcardsForTopico,
  generateAndSaveFlashcardsForTopico,
} from '../services/topicoFlashcardsService'
import { normalizeTopicKeyForStorage } from '../utils/topicKeyFirestore'
import { generateShareToken } from '../utils/shareToken'
import ShareItemButton from '../components/share/ShareItemButton'
import { FEED_POST_TYPES } from '../services/trilhaFeedService'
import { CONTENT_STATUS, isContentAvailable, toggleContentStatus } from '../utils/contentStatus'
import { persistCardReview } from '../utils/spacedRepetition'
import { useTopicCourseAccess } from '../hooks/useTopicCourseAccess'
import toast from 'react-hot-toast'
import ProfessorFlagNoteBanner, {
  scrollToFocusedContent,
} from '../components/content/ProfessorFlagNoteBanner'
import { findCardIndex } from '../utils/flagCorrectionLinks'
import { buildFlashcardContentId } from '../utils/contentCommentIds'

const FlashcardsTopicoView = () => {
  const { courseId: courseIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const { user, favorites, updateFavorites, profile, isAdmin } = useAuth()

  const disciplina = decodeURIComponent(searchParams.get('disciplina') || '')
  const modulo = decodeURIComponent(searchParams.get('modulo') || '')
  const topicKey = normalizeTopicKeyForStorage(searchParams.get('topicKey') || '')

  const courseId = courseIdParam || profile?.selectedCourseId || 'alego-default'
  const { canAccess: hasTopicAccess } = useTopicCourseAccess(courseId, topicKey, profile)

  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [cardProgress, setCardProgress] = useState({})
  const [fromCache, setFromCache] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const MIN_TOPIC_FLASHCARDS = 20

  const publishStatus = useMemo(() => {
    if (cards.length === 0) return CONTENT_STATUS.UNAVAILABLE
    return cards.every((c) => c.status === CONTENT_STATUS.AVAILABLE)
      ? CONTENT_STATUS.AVAILABLE
      : CONTENT_STATUS.UNAVAILABLE
  }, [cards])

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
        let existing = await fetchFlashcardsForTopico(courseId, disciplina, modulo, topicKey, {
          includeUnpublished: isAdmin,
        })

        if (existing.length === 0 && isAdmin) {
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
            userId: user?.uid,
          })
          if (!cancelled) setFromCache(false)
        } else if (!cancelled) {
          setFromCache(existing.length > 0)
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
  }, [user, courseId, disciplina, modulo, topicKey, isAdmin])

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

  const { dueQueue, stats } = useSRSDeck(cards, cardProgress)
  const studyCards = dueQueue
  const shareCard = studyCards[currentIndex] || cards[currentIndex] || cards[0]
  const shareIndex = studyCards.length > 0 ? currentIndex : cards.indexOf(shareCard)

  const handleRate = useCallback(
    async (cardId, difficulty) => {
      if (!user) return
      try {
        const { updated } = await persistCardReview(user.uid, cardId, cardProgress, difficulty, courseId)
        setCardProgress(updated)
        setTimeout(() => {
          setCurrentIndex((i) => {
            const remaining = dueQueue.filter((c) => c.id !== cardId).length
            if (remaining <= 0) return 0
            return i >= remaining ? 0 : i
          })
        }, 200)
      } catch (err) {
        console.error(err)
        toast.error('Erro ao salvar revisão')
      }
    },
    [user, cardProgress, courseId, dueQueue],
  )

  useEffect(() => {
    if (currentIndex >= studyCards.length && studyCards.length > 0) {
      setCurrentIndex(0)
    }
  }, [studyCards.length, currentIndex])

  const handleRegenerate = async () => {
    if (!isAdmin || regenerating || generating) return
    if (!window.confirm(`Regenerar flashcards deste tópico? Serão criados de ${MIN_TOPIC_FLASHCARDS} a 50 cards focados apenas neste tópico.`)) {
      return
    }

    setRegenerating(true)
    setError(null)
    try {
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

      const generated = await generateAndSaveFlashcardsForTopico({
        courseId,
        disciplina,
        topicoNome,
        topicoNumero,
        topicKey,
        moduloLabel: modulo,
        courseName,
        editalText,
        userId: user?.uid,
      })
      setCards(generated)
      setCurrentIndex(0)
      setFromCache(false)
      toast.success(`${generated.length} flashcards gerados para este tópico.`)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Erro ao regenerar flashcards')
      toast.error('Erro ao regenerar flashcards')
    } finally {
      setRegenerating(false)
    }
  }

  const handleTogglePublish = async () => {
    if (!isAdmin || cards.length === 0) return
    setPublishing(true)
    try {
      const novoStatus = toggleContentStatus(publishStatus)
      const batch = writeBatch(db)
      cards.forEach((card) => {
        batch.set(
          doc(db, 'courses', courseId, 'flashcards', card.id),
          { status: novoStatus, updatedAt: serverTimestamp() },
          { merge: true }
        )
      })
      await batch.commit()
      setCards((prev) => prev.map((c) => ({ ...c, status: novoStatus })))
      toast.success(novoStatus === CONTENT_STATUS.AVAILABLE ? 'Flashcards disponibilizados!' : 'Flashcards ocultados.')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao alterar status dos flashcards')
    } finally {
      setPublishing(false)
    }
  }

  const toggleFavorite = async (id) => {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id]
    await updateFavorites(next)
  }

  const handleEditFlashcard = async (cardId, newPergunta, newResposta) => {
    try {
      await saveFlashcardContent({
        courseId,
        cardId,
        pergunta: newPergunta,
        resposta: newResposta,
      })
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? { ...card, pergunta: newPergunta, resposta: newResposta, frente: newPergunta, verso: newResposta }
            : card
        )
      )
    } catch (error) {
      console.error('Erro ao editar flashcard:', error)
      alert('Erro ao editar flashcard. Tente novamente.')
      throw error
    }
  }

  const handleDeleteFlashcard = async (cardId) => {
    try {
      await deleteFlashcardContent({ courseId, cardId })
      setCards((prev) => prev.filter((card) => card.id !== cardId))
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
    window.open(`/flashcards/pip/${courseId}?${params.toString()}`, 'flashcard-pip', 'width=800,height=600,scrollbars=yes,resizable=yes')
  }

  const handleShareFlashcards = async () => {
    try {
      const token = await generateShareToken({ courseId, disciplina, modulo, topicKey })
      await navigator.clipboard.writeText(`${window.location.origin}/share-flashcards/${token}`)
      toast.success('Link copiado! Expira em 1 hora após o primeiro acesso.')
    } catch (error) {
      console.error('Erro ao gerar link:', error)
      toast.error('Erro ao gerar link de compartilhamento')
    }
  }

  if (!disciplina || !modulo) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-center">
        <div className="cp-card max-w-md p-8">
          <p className="text-cp-muted mb-4">Tópico inválido.</p>
          <Link to="/flashcards" className="cp-btn-primary inline-flex">
            Voltar aos flashcards
          </Link>
        </div>
      </div>
    )
  }

  const canStudy = isAdmin || (hasTopicAccess && cards.length > 0 && isContentAvailable(publishStatus, false))

  useEffect(() => {
    const focusId = searchParams.get('focusContentId')
    if (!focusId || !cards.length) return
    const idx = findCardIndex(cards, focusId)
    if (idx >= 0) setCurrentIndex(idx)
    const t = setTimeout(() => {
      const contentId =
        buildFlashcardContentId({
          courseId,
          topicKey,
          card: cards[idx >= 0 ? idx : 0],
          cardIndex: idx >= 0 ? idx : 0,
        }) || focusId
      scrollToFocusedContent(contentId)
      scrollToFocusedContent(focusId)
    }, 400)
    return () => clearTimeout(t)
  }, [cards, searchParams, courseId, topicKey])

  return (
    <div className="space-y-6 pb-10">
      <ProfessorFlagNoteBanner />
      <div className="cp-card p-4 sm:p-5">
        <Link
          to="/edital-verticalizado"
          className="mb-3 inline-flex items-center gap-2 text-sm text-cp-muted transition hover:text-cp-accent"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Voltar ao edital
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-indigo-500">{disciplina}</p>
            <h1 className="text-lg font-semibold text-cp-text">{modulo}</h1>
            {fromCache && cards.length > 0 && (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                {cards.length} flashcards neste tópico
                {cards.length < MIN_TOPIC_FLASHCARDS && isAdmin ? ' — abaixo do mínimo recomendado (20)' : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && cards.length > 0 && (
              <ContentPublishButton
                status={publishStatus}
                onToggle={handleTogglePublish}
                disabled={publishing}
                hint="Use Liberar no edital para publicar tudo de uma vez."
              />
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating || generating}
                className="cp-btn-ghost !text-xs"
              >
                {regenerating ? 'Regenerando...' : cards.length < MIN_TOPIC_FLASHCARDS ? 'Completar flashcards' : 'Regenerar'}
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={handleShareFlashcards} className="cp-btn-ghost !text-xs">
                <ShareIcon className="h-4 w-4" />
                Link temporário
              </button>
            )}
            {(canStudy || isAdmin) && shareCard && studyCards.length === 0 && (
              <ShareItemButton
                type="flashcard"
                postType={FEED_POST_TYPES.FLASHCARDS}
                materia={disciplina}
                assunto={modulo}
                courseId={courseId}
                topicKey={topicKey}
                itemIndex={shareIndex >= 0 ? shareIndex : 0}
                flashcard={shareCard}
                shareUrl={`/flashcards/topico/${courseId}?disciplina=${encodeURIComponent(disciplina)}&modulo=${encodeURIComponent(modulo)}&topicKey=${encodeURIComponent(topicKey)}`}
              />
            )}
            <button type="button" onClick={openPIPMode} className="cp-btn-ghost !text-xs">
              <PhotoIcon className="h-4 w-4" />
              Modo PIP
            </button>
          </div>
        </div>
      </div>

      {(loading || generating || regenerating) && (
        <div className="cp-card flex flex-col items-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-cp-text">
            {generating || regenerating ? 'Gerando flashcards com IA (20–50 por tópico)...' : 'Carregando...'}
          </p>
          {generating && isAdmin && (
            <p className="mt-2 text-xs text-cp-muted">Após gerar, clique em Disponibilizar para liberar aos alunos.</p>
          )}
        </div>
      )}

      {error && !loading && (
        <div className="cp-card border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600">{error}</div>
      )}

      {!loading && !generating && !regenerating && !error && cards.length === 0 && !isAdmin && (
        <div className="cp-card p-10 text-center">
          <p className="text-4xl mb-3">⏳</p>
          <p className="font-medium text-cp-text">Flashcards em preparação</p>
          <p className="mt-2 text-sm text-cp-muted">O administrador ainda não disponibilizou os flashcards deste tópico.</p>
        </div>
      )}

      {!loading && !generating && !regenerating && !error && cards.length > 0 && !canStudy && !isAdmin && (
        <div className="cp-card p-10 text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-medium text-cp-text">Conteúdo em preparação</p>
          <p className="mt-2 text-sm text-cp-muted">Aguarde o administrador disponibilizar estes flashcards.</p>
        </div>
      )}

      {!loading && !generating && !regenerating && !error && canStudy && cards.length > 0 && studyCards.length === 0 && (
        <div className="cp-card p-10 text-center">
          <p className="text-4xl mb-3">✨</p>
          <p className="font-medium text-cp-text">Tudo em dia!</p>
          <p className="mt-2 text-sm text-cp-muted">
            {stats.nextDue
              ? `Próxima revisão em ${stats.nextDue.format('DD/MM [às] HH:mm')}`
              : `${stats.total} cards neste tópico · nenhum pendente agora`}
          </p>
        </div>
      )}

      {!loading && !generating && !regenerating && !error && canStudy && studyCards.length > 0 && (
        <div className="cp-card p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between text-xs text-cp-muted">
            <span>Revisão espaçada · {studyCards.length} para revisar agora</span>
            <div className="flex items-center gap-2">
              <span>{stats.reviewed}/{stats.total} já estudados</span>
              {shareCard && (
                <ShareItemButton
                  type="flashcard"
                  postType={FEED_POST_TYPES.FLASHCARDS}
                  materia={disciplina}
                  assunto={modulo}
                  courseId={courseId}
                  topicKey={topicKey}
                  itemIndex={shareIndex >= 0 ? shareIndex : currentIndex}
                  flashcard={shareCard}
                  shareUrl={`/flashcards/topico/${courseId}?disciplina=${encodeURIComponent(disciplina)}&modulo=${encodeURIComponent(modulo)}&topicKey=${encodeURIComponent(topicKey)}`}
                  className="cp-btn-ghost !text-[10px] !py-1"
                  label="Compartilhar"
                />
              )}
            </div>
          </div>
          <FlashcardList
            cards={studyCards}
            currentIndex={currentIndex}
            onSelect={setCurrentIndex}
            onToggleFavorite={toggleFavorite}
            onRateDifficulty={handleRate}
            favorites={favorites}
            cardProgress={cardProgress}
            onPrev={() => setCurrentIndex((i) => (i - 1 < 0 ? studyCards.length - 1 : i - 1))}
            onNext={() => setCurrentIndex((i) => (i + 1 >= studyCards.length ? 0 : i + 1))}
            onShuffle={() => setCards((prev) => [...prev].sort(() => Math.random() - 0.5))}
            viewedIds={viewedIds}
            showRating
            onEditFlashcard={handleEditFlashcard}
            onDeleteFlashcard={handleDeleteFlashcard}
            courseId={courseId}
            topicKey={topicKey}
            deckTitle={modulo}
            deckSubtitle={disciplina}
          />
        </div>
      )}
    </div>
  )
}

export default FlashcardsTopicoView
