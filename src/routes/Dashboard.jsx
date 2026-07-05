import { useEffect, useMemo, useState, startTransition } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  getDocs,
  deleteDoc,
} from 'firebase/firestore'
import {
  TrophyIcon,
  BookOpenIcon,
  ClockIcon,
  ChartBarIcon,
  LightBulbIcon,
  AcademicCapIcon,
  CheckCircleIcon,
  FireIcon,
  ArrowRightIcon,
  CalendarIcon,
  SparklesIcon,
  ArrowPathIcon,
  UsersIcon,
} from '@heroicons/react/24/solid'
import {
  ArrowRightIcon as ArrowRightOutline,
  PlayIcon,
} from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useSubjectOrder } from '../hooks/useSubjectOrder'
import { applySubjectOrder } from '../utils/subjectOrder'
import { isTrialMode, getTrialData } from '../utils/trialLimits'
import { motion } from 'framer-motion'
import { DocumentTextIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import InstallPWAButton from '../components/InstallPWAButton'
import LGPDConsent from '../components/LGPDConsent'
import ProgressCalendar from '../components/ProgressCalendar'
import { byMateriaToChartData } from '../utils/questoesStats'

dayjs.locale('pt-br')

const Dashboard = () => {
  const { user, profile } = useAuth()
  const [progressData, setProgressData] = useState([])
  const [cardProgress, setCardProgress] = useState({})
  const [allCards, setAllCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [loadingEdital, setLoadingEdital] = useState(false)
  const [questoesStats, setQuestoesStats] = useState({ correct: 0, wrong: 0, byMateria: {} })
  const [savingProgress, setSavingProgress] = useState(false)
  const { subjectOrder } = useSubjectOrder()

  
  // Carregar curso selecionado
  useEffect(() => {
    if (!profile) return
    
    const courseFromProfile = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
    setSelectedCourseId(courseFromProfile)
    
    const loadCourseData = async () => {
      try {
        const courseId = courseFromProfile || 'alego-default'
        const courseDoc = await getDoc(doc(db, 'courses', courseId))
        
        if (courseDoc.exists()) {
          const courseData = courseDoc.data()
          setCourseName(courseData.name || courseData.competition || '')
        } else {
          setCourseName('ALEGO Policial Legislativo')
        }
      } catch (err) {
        console.error('Erro ao carregar curso:', err)
        setCourseName('ALEGO Policial Legislativo')
      }
    }
    
    loadCourseData()
  }, [profile])


  // Carregar progresso do usuário - CORRIGIDO para sincronização correta
  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    const courseKey = selectedCourseId || 'alego'
    const progressRef = collection(db, 'progress')
    
    // Função para carregar progresso
    // Não usar orderBy no Firestore para evitar necessidade de índice composto
    // Ordenação será feita manualmente após filtrar
    const tryLoadProgress = () => {
      try {
        const q = query(progressRef, where('uid', '==', user.uid))

        const unsub = onSnapshot(
          q,
          (snapshot) => {
            const data = snapshot.docs
              .map((docSnap) => {
                const data = docSnap.data()
                // Verificar se o documento segue o padrão userId_courseKey_date
                const docIdParts = docSnap.id.split('_')
                if (docIdParts.length >= 3) {
                  const docCourseKey = docIdParts[1]
                  const docDate = docIdParts.slice(2).join('_')
                  return {
                    ...data,
                    courseId: data.courseId || (docCourseKey === 'alego' ? null : docCourseKey),
                    date: data.date || docDate
                  }
                }
                return data
              })
              .filter((item) => {
                // Filtrar por curso - garantir sincronização correta
                const itemCourseId = item.courseId
                const matchesCourse = selectedCourseId
                  ? (itemCourseId === selectedCourseId || String(itemCourseId) === String(selectedCourseId))
                  : (!itemCourseId || itemCourseId === '' || itemCourseId === null || itemCourseId === 'alego-default')
                
                // Filtrar apenas dias com horas > 0 (para aparecer no calendário)
                const hasHours = item.hours && parseFloat(item.hours) > 0
                
                return matchesCourse && hasHours && item.date
              })
            
            // Ordenar manualmente por data (mais recente primeiro)
            data.sort((a, b) => {
              const dateA = a.date || ''
              const dateB = b.date || ''
              return dateB.localeCompare(dateA) // Mais recente primeiro
            })

        startTransition(() => {
          setProgressData(data)

          const bySubject = {}
          data.forEach((item) => {
            if (item.hours > 0 && item.date) {
              if (!bySubject[item.date]) {
                bySubject[item.date] = { hours: 0, count: 0, materia: null }
              }
              bySubject[item.date].hours += parseFloat(item.hours || 0)
              bySubject[item.date].count += 1
              if (item.materia) bySubject[item.date].materia = item.materia
            }
          })
          setStudyBySubject(bySubject)
        })
      },
      (error) => {
        console.error('Erro ao carregar progresso:', error)
        setProgressData([])
      }
    )
        
        return unsub
      } catch (err) {
        console.error('Erro ao criar query de progresso:', err)
        setProgressData([])
        return () => {}
      }
    }

    const unsub = tryLoadProgress()

    return () => unsub()
  }, [user, selectedCourseId])

  // Carregar progresso de cards - FILTRADO POR CURSO para sincronização correta
  useEffect(() => {
    if (!user) return

    const userProgressRef = doc(db, 'userProgress', user.uid)
    const unsub = onSnapshot(
      userProgressRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          const allCardProgress = data.cardProgress || {}
          
          // Filtrar cards apenas do curso selecionado
          // IMPORTANTE: Incluir TODOS os progressos de cards que pertencem ao curso selecionado
          const filteredProgress = {}
          const currentCourseId = selectedCourseId || null
          
          // Criar um mapa de cards por ID para busca rápida
          const cardsById = {}
          allCards.forEach(card => {
            cardsById[card.id] = card
          })
          
          // Filtrar progressos: incluir se o card pertence ao curso selecionado
          Object.keys(allCardProgress).forEach(cardId => {
            const progress = allCardProgress[cardId]
            const card = cardsById[cardId]
            
            // Se temos o card carregado, verificar o courseId do card
            if (card) {
              const cardCourseId = card.courseId || null
              // Incluir se o curso do card corresponde ao curso selecionado
              if (cardCourseId === currentCourseId) {
                filteredProgress[cardId] = progress
              }
            } else {
              // Se não temos o card ainda, incluir o progresso temporariamente
              // Será filtrado depois quando os cards carregarem
              // Mas só incluir se tiver reviewCount > 0 (foi estudado)
              if (progress?.reviewCount > 0) {
                filteredProgress[cardId] = progress
              }
            }
          })
          
          startTransition(() => {
            setCardProgress(filteredProgress)
          })
        } else {
          setCardProgress({})
        }
      },
      (error) => {
        console.error('Erro ao carregar progresso de cards:', error)
        setCardProgress({})
      }
    )

    return () => unsub()
  }, [user, selectedCourseId, allCards])

  // Carregar estatísticas de questões (para taxa de acerto)
  useEffect(() => {
    if (!user || selectedCourseId === undefined) return
    
    const courseKey = selectedCourseId || 'alego'
    const statsRef = doc(db, 'questoesStats', `${user.uid}_${courseKey}`)
    const unsub = onSnapshot(
      statsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          const dataCourseId = data.courseId || null
          const currentCourseId = selectedCourseId || null
          
          if (dataCourseId === currentCourseId || (dataCourseId === null && currentCourseId === null)) {
            startTransition(() => {
              setQuestoesStats({
                correct: data.correct || 0,
                wrong: data.wrong || 0,
                byMateria: data.byMateria || {}
              })
            })
          } else {
            setQuestoesStats({ correct: 0, wrong: 0, byMateria: {} })
          }
        } else {
          setQuestoesStats({ correct: 0, wrong: 0, byMateria: {} })
        }
      },
      (error) => {
        console.error('Erro ao carregar estatísticas de questões:', error)
      }
    )
    
    return () => unsub()
  }, [user, selectedCourseId])

  // Carregar flashcards filtrados por curso selecionado com cache
  useEffect(() => {
    if (!user || !profile) return
    
    // Tentar carregar do cache primeiro (funciona offline)
    const cacheKey = `flashcards_${selectedCourseId || 'alego'}_${user.uid}`
    let cachedDataLoaded = false
    
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        // Usar cache se tiver menos de 24 horas (para funcionar offline)
        if (now - timestamp < 24 * 60 * 60 * 1000 && cachedData && cachedData.length > 0) {
          startTransition(() => {
            setAllCards(cachedData)
            setLoading(false)
          })
          cachedDataLoaded = true
          // Se estiver offline, não tenta buscar do Firebase
          if (!navigator.onLine) {
            return () => {} // Cleanup vazio se estiver offline e usando cache
          }
        }
      }
    } catch (err) {
      // Log removido para limpar console
    }
    
    const cardsRef = collection(db, 'flashcards')
    let retryCount = 0
    const maxRetries = 3
    
    const loadData = () => {
      const unsub = onSnapshot(
        cardsRef,
        (snapshot) => {
          const cards = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))

          // Filtrar por curso
          const courseId = selectedCourseId || 'alego-default'
          const filteredCards = cards.filter((card) => {
            if (courseId === 'alego-default') {
              return !card.courseId || card.courseId === '' || card.courseId === 'alego-default'
            }
            return card.courseId === courseId || String(card.courseId) === String(courseId)
          })

          // Aplicar ordem de matérias
          const orderedCards = applySubjectOrder(filteredCards, subjectOrder)

          startTransition(() => {
            setAllCards(orderedCards)
            setLoading(false)
          })

          // Salvar no cache
          try {
            localStorage.setItem(
              `firebase_cache_${cacheKey}`,
              JSON.stringify({
                data: orderedCards,
                timestamp: Date.now(),
              })
            )
          } catch (err) {
            // Log removido para limpar console
          }

          retryCount = 0
        },
        (error) => {
          console.error('Erro ao carregar flashcards:', error)
          // Se der erro e tiver cache, usar o cache
          if (cachedDataLoaded) {
            try {
              const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
              if (cached) {
                const { data: cachedData } = JSON.parse(cached)
                if (cachedData && cachedData.length > 0) {
                  startTransition(() => {
                    setAllCards(cachedData)
                    setLoading(false)
                  })
                  return
                }
              }
            } catch (err) {
              // Log removido para limpar console
            }
          }
          retryCount++
          if (retryCount < maxRetries) {
            setTimeout(loadData, 1000 * retryCount)
          } else {
            setLoading(false)
          }
        }
      )

      return () => unsub()
    }

    const unsubscribe = loadData()
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [user, profile, selectedCourseId, subjectOrder])

  // Carregar Edital Verticalizado
  useEffect(() => {
    if (!selectedCourseId) {
      setEditalVerticalizado(null)
      return
    }

    setLoadingEdital(true)
    const editalRef = doc(db, 'courses', selectedCourseId, 'editalVerticalizado', 'principal')
    const unsub = onSnapshot(
      editalRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setEditalVerticalizado(snapshot.data())
        } else {
          setEditalVerticalizado(null)
        }
        setLoadingEdital(false)
      },
      (error) => {
        console.error('Erro ao carregar edital verticalizado:', error)
        setEditalVerticalizado(null)
        setLoadingEdital(false)
      }
    )

    return () => unsub()
  }, [selectedCourseId])

  // Forçar atualização diária do progresso por matéria
  const [currentDate, setCurrentDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [studyBySubject, setStudyBySubject] = useState({})
  
  useEffect(() => {
    const updateDate = () => {
      const today = dayjs().format('YYYY-MM-DD')
      setCurrentDate(today)
    }
    
    updateDate()
    const interval = setInterval(updateDate, 60000) // Verificar a cada minuto
    
    return () => clearInterval(interval)
  }, [])

  const studyDates = useMemo(
    () => progressData.filter((item) => item.hours > 0 && item.date).map((item) => item.date),
    [progressData]
  )

  const currentStreak = useMemo(() => {
    if (!studyDates.length) return 0
    const sorted = [...new Set(studyDates)]
      .map((d) => dayjs(d))
      .filter((d) => d.isValid())
      .sort((a, b) => b.diff(a))
    if (!sorted.length) return 0
    let streak = 0
    let expected = dayjs().startOf('day')
    if (!sorted[0].isSame(expected, 'day') && !sorted[0].isSame(expected.subtract(1, 'day'), 'day')) {
      return 0
    }
    if (sorted[0].isSame(expected.subtract(1, 'day'), 'day')) expected = expected.subtract(1, 'day')
    for (const d of sorted) {
      if (d.isSame(expected, 'day')) {
        streak++
        expected = expected.subtract(1, 'day')
      } else if (d.isBefore(expected, 'day')) break
    }
    return streak
  }, [studyDates])

  const questoesPorMateria = useMemo(
    () => byMateriaToChartData(questoesStats.byMateria),
    [questoesStats.byMateria]
  )

  const handleMarkDay = async (dateStr) => {
    if (!user || savingProgress) return
    setSavingProgress(true)
    try {
      const courseKey = selectedCourseId || 'alego'
      const progressDoc = doc(db, 'progress', `${user.uid}_${courseKey}_${dateStr}`)
      const existing = await getDoc(progressDoc)
      if (existing.exists()) {
        await deleteDoc(progressDoc)
      } else {
        await setDoc(progressDoc, {
          uid: user.uid,
          date: dateStr,
          hours: 0.1,
          courseId: selectedCourseId || null,
          lastUpdated: dayjs().format('HH:mm:ss'),
        })
      }
    } catch (err) {
      console.error('Erro ao marcar dia:', err)
    } finally {
      setSavingProgress(false)
    }
  }

  const cardsToReviewCount = useMemo(() => {
    const now = dayjs()
    return allCards.filter((card) => {
      const cardCourseId = card.courseId || null
      const currentCourseId = selectedCourseId || null
      if (cardCourseId !== currentCourseId) return false
      const progress = cardProgress[card.id]
      if (!progress?.nextReview) return true
      const nextReview = dayjs(progress.nextReview)
      return nextReview.isBefore(now) || nextReview.isSame(now)
    }).length
  }, [allCards, cardProgress, selectedCourseId])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
          <p className="mt-4 font-mono text-sm text-cp-muted">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  const quickLinks = [
    { to: '/flashcards', title: 'Flashcards com IA', desc: 'Repetição espaçada por tópico', icon: SparklesIcon, accent: 'cp-card-accent-violet' },
    { to: '/edital-verticalizado', title: 'Edital Verticalizado', desc: 'Conteúdo organizado do edital', icon: DocumentTextIcon, accent: 'cp-card-accent-cyan' },
    { to: '/guia-mentorado', title: 'Guia Mentorado', desc: 'Cronograma estratégico', icon: LightBulbIcon, accent: 'cp-card-accent-pink' },
    { to: '/vespera-de-prova', title: 'Véspera de Prova', desc: 'Revisão final antes da prova', icon: ClockIcon, accent: 'cp-card-accent-cyan' },
    { to: '/treino-redacao', title: 'Treino de Redação', desc: 'Pratique redações com IA', icon: DocumentTextIcon, accent: 'cp-card-accent-violet' },
    { to: '/materia-revisada', title: 'Matéria Revisada', desc: 'Registro do que você revisou', icon: CheckCircleIcon, accent: 'cp-card-accent-amber' },
  ]

  return (
    <div className="pb-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="cp-badge cp-badge-accent">Dashboard</span>
            <h1 className="cp-headline mt-4 text-3xl sm:text-4xl">
              Olá, <span className="cp-gradient-text">{user?.displayName?.split(' ')[0] || 'estudante'}</span>
            </h1>
            <p className="mt-2 text-cp-muted">
              {courseName ? `Progresso em ${courseName}` : 'Acompanhe seu progresso preditivo'}
            </p>
          </div>
          <Link to="/flashcards" className="cp-btn-primary shrink-0 self-start sm:self-auto">
            <SparklesIcon className="h-4 w-4" />
            Estudar flashcards
          </Link>
        </div>
      </motion.div>

      {/* Progresso — calendário + questões por matéria */}
      <motion.div
        id="progresso"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8 space-y-6"
      >
        <div className="flex items-center gap-2">
          <span className="cp-badge cp-badge-accent">Progresso</span>
        </div>

        <div className="cp-card overflow-hidden p-1 sm:p-2">
          <ProgressCalendar
            dates={studyDates}
            streak={currentStreak}
            bySubject={studyBySubject}
            onMarkDay={handleMarkDay}
          />
        </div>

        <div className="cp-card p-5 sm:p-6">
          <h3 className="text-base font-medium text-cp-text sm:text-lg">Questões por matéria</h3>
          <p className="mt-1 text-xs text-cp-muted sm:text-sm">
            Dados reais das questões respondidas nos tópicos do edital
          </p>
          {questoesPorMateria.length > 0 ? (
            <div className="mt-4 space-y-3">
              {questoesPorMateria.map((m) => (
                <div key={m.name} className="rounded-xl border border-cp-border bg-cp-bg/40 p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-cp-text">{m.name}</span>
                    <span className="font-mono text-xs text-cp-accent">{m.aproveitamento}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-cp-border">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cp-accent to-cp-accent2"
                      style={{ width: `${m.aproveitamento}%` }}
                    />
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-cp-muted">
                    {m.acertos} acertos · {m.erros} erros · {m.value} questões
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 py-8 text-center text-sm text-cp-muted">
              Responda questões nos tópicos do edital para ver seu progresso aqui.
            </p>
          )}
        </div>
      </motion.div>

      {/* Revisão pendente */}
      {cardsToReviewCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="cp-glass-panel mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-mono text-xs text-cp-accent2">revisão pendente</p>
            <p className="mt-1 text-sm text-cp-text">
              <strong>{cardsToReviewCount}</strong> flashcards aguardando revisão
            </p>
          </div>
          <Link to="/flashcards" className="cp-btn-primary !py-2.5 !text-sm">
            <PlayIcon className="h-4 w-4" />
            Revisar agora
          </Link>
        </motion.div>
      )}

      <div className="mb-8">
        <InstallPWAButton />
      </div>

      {/* Edital Verticalizado — stats cards removidos acima */}
      {selectedCourseId && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="cp-card cp-card-accent-violet mb-8 p-5 sm:p-6"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cp-accent/20 bg-cp-accent/10">
              <DocumentTextIcon className="h-5 w-5 text-cp-accent" />
            </div>
            <div>
              <h3 className="text-base font-medium text-cp-text sm:text-lg">Edital Verticalizado</h3>
              <p className="text-xs text-cp-muted sm:text-sm">Edital organizado para estudos</p>
            </div>
          </div>

          {loadingEdital ? (
            <div className="py-6 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
            </div>
          ) : !editalVerticalizado ? (
            <div className="py-8 text-center">
              <DocumentTextIcon className="mx-auto mb-3 h-10 w-10 text-cp-muted" />
              <p className="text-sm text-cp-muted">Edital verticalizado ainda não disponível.</p>
              <p className="mt-1 text-xs text-cp-muted/70">O administrador precisa fazer upload do edital.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-cp-border bg-cp-surface p-4 sm:p-5">
                <h4 className="text-base font-medium text-cp-text sm:text-lg">
                  {editalVerticalizado.titulo || 'Edital Verticalizado'}
                </h4>
                {editalVerticalizado.descricao && (
                  <p className="mt-2 text-sm text-cp-muted">{editalVerticalizado.descricao}</p>
                )}
                {editalVerticalizado.updatedAt && (
                  <p className="mt-2 font-mono text-[10px] text-cp-muted">
                    Atualizado em{' '}
                    {editalVerticalizado.updatedAt.toDate?.().toLocaleDateString('pt-BR') || '—'}
                  </p>
                )}

                {editalVerticalizado.secoes && editalVerticalizado.secoes.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {editalVerticalizado.secoes.slice(0, 5).map((secao, idx) => (
                      <div key={idx} className="rounded-xl border border-cp-border bg-cp-bg/50 p-3 sm:p-4">
                        <h5 className="text-sm font-medium text-cp-text">{secao.titulo}</h5>
                        {secao.conteudo && (
                          <p className="mt-1 line-clamp-2 text-xs text-cp-muted">
                            {secao.conteudo.substring(0, 150)}...
                          </p>
                        )}
                      </div>
                    ))}
                    {editalVerticalizado.secoes.length > 5 && (
                      <p className="text-center text-xs text-cp-muted">
                        +{editalVerticalizado.secoes.length - 5} seções adicionais
                      </p>
                    )}
                  </div>
                ) : editalVerticalizado.conteudo ? (
                  <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-cp-border bg-cp-bg/50 p-4 sm:max-h-96">
                    <div
                      className="prose prose-sm max-w-none text-sm text-cp-muted dark:prose-invert"
                      dangerouslySetInnerHTML={{
                        __html: `${editalVerticalizado.conteudo.substring(0, 500)}...`,
                      }}
                    />
                  </div>
                ) : null}

                <Link
                  to={`/edital-verticalizado?course=${selectedCourseId}`}
                  className="cp-btn-ghost mt-4 inline-flex !text-sm"
                >
                  Ver edital completo
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Links rápidos */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="cp-badge">Acesso rápido</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`cp-card group p-5 transition ${link.accent}`}
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-cp-border bg-cp-surface text-cp-accent transition group-hover:border-cp-accent/30 group-hover:shadow-cp-glow">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-medium text-cp-text">{link.title}</h3>
                <p className="mt-1 text-xs text-cp-muted">{link.desc}</p>
                <ArrowRightOutline className="mt-3 h-4 w-4 text-cp-accent transition group-hover:translate-x-1" />
              </Link>
            )
          })}
        </div>
      </motion.div>

      <LGPDConsent />
    </div>
  )
}

export default Dashboard

