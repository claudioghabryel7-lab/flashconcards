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
// import StudyTimeChart from '../components/StudyTimeChart' // TEMPORARIAMENTE DESATIVADO

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
  
  useEffect(() => {
    const updateDate = () => {
      const today = dayjs().format('YYYY-MM-DD')
      setCurrentDate(today)
    }
    
    updateDate()
    const interval = setInterval(updateDate, 60000) // Verificar a cada minuto
    
    return () => clearInterval(interval)
  }, [])

  // Calcular estatísticas
  const stats = useMemo(() => {
    const totalDays = new Set(progressData.map((item) => item.date)).size
    const totalHours = progressData.reduce((sum, item) => sum + parseFloat(item.hours || 0), 0)
    const studiedCards = Object.keys(cardProgress).filter(
      (cardId) => cardProgress[cardId]?.reviewCount > 0
    ).length
    const totalCards = allCards.length

    // Calcular sequência (streak)
    const dates = progressData.map((item) => item.date).sort().reverse()
    let streak = 0
    let currentDateForStreak = dayjs().startOf('day')
    
    for (const dateStr of dates) {
      const date = dayjs(dateStr)
      if (date.isSame(currentDateForStreak, 'day')) {
        streak++
        currentDateForStreak = currentDateForStreak.subtract(1, 'day')
      } else if (date.isBefore(currentDateForStreak, 'day')) {
        break
      }
    }

    // Progresso por matéria
    const bySubject = {}
    allCards.forEach((card) => {
      const materia = card.materia || 'Geral'
      if (!bySubject[materia]) {
        bySubject[materia] = { totalCards: 0, studiedCards: 0 }
      }
      bySubject[materia].totalCards++
      if (cardProgress[card.id]?.reviewCount > 0) {
        bySubject[materia].studiedCards++
      }
    })

    // Calcular porcentagem por matéria
    Object.keys(bySubject).forEach((materia) => {
      const stats = bySubject[materia]
      stats.percentage = stats.totalCards > 0
        ? Math.round((stats.studiedCards / stats.totalCards) * 100)
        : 0
    })

    // Cards para revisar (próximos reviews)
    const now = dayjs()
    const cardsToReview = allCards.filter((card) => {
      const progress = cardProgress[card.id]
      if (!progress || !progress.nextReview) return false
      const nextReview = dayjs(progress.nextReview)
      return nextReview.isBefore(now) || nextReview.isSame(now, 'day')
    })

    // Taxa de acerto (baseado em questoesStats - questões respondidas)
    const totalQuestoes = questoesStats.correct + questoesStats.wrong
    const accuracy = totalQuestoes > 0 
      ? Math.round((questoesStats.correct / totalQuestoes) * 100) 
      : 0

    return {
      totalDays,
      totalHours: totalHours.toFixed(1),
      studiedCards,
      totalCards,
      streak,
      bySubject,
      cardsToReview: cardsToReview.length,
      accuracy,
    }
  }, [progressData, cardProgress, allCards, questoesStats, currentDate]) // Adicionar currentDate como dependência

  // Cards para revisar (detalhado) - FILTRADO POR CURSO
  const reviewCards = useMemo(() => {
    const now = dayjs()
    return allCards
      .filter((card) => {
        // Garantir que o card pertence ao curso selecionado
        const cardCourseId = card.courseId || null
        const currentCourseId = selectedCourseId || null
        if (cardCourseId !== currentCourseId) return false
        
        const progress = cardProgress[card.id]
        if (!progress || !progress.nextReview) return false
        const nextReview = dayjs(progress.nextReview)
        return nextReview.isBefore(now) || nextReview.isSame(now, 'day')
      })
      .slice(0, 5) // Limitar a 5 cards
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

  const statCards = [
    {
      label: 'Sequência',
      value: stats.streak,
      suffix: 'dias',
      icon: FireIcon,
      accent: 'cp-card-accent-amber',
      iconClass: 'text-cp-accent4 bg-cp-accent4/10 border-cp-accent4/20',
    },
    {
      label: 'Horas estudadas',
      value: stats.totalHours,
      suffix: 'h',
      icon: ClockIcon,
      accent: 'cp-card-accent-cyan',
      iconClass: 'text-cp-accent2 bg-cp-accent2/10 border-cp-accent2/20',
    },
    {
      label: 'Flashcards',
      value: `${stats.studiedCards}/${stats.totalCards}`,
      suffix: '',
      icon: BookOpenIcon,
      accent: 'cp-card-accent-violet',
      iconClass: 'text-cp-accent bg-cp-accent/10 border-cp-accent/20',
    },
    {
      label: 'Taxa de acerto',
      value: stats.accuracy,
      suffix: '%',
      icon: ChartBarIcon,
      accent: 'cp-card-accent-pink',
      iconClass: 'text-cp-accent3 bg-cp-accent3/10 border-cp-accent3/20',
    },
  ]

  const quickLinks = [
    { to: '/flashcards', title: 'Flashcards com IA', desc: 'Estude com flashcards inteligentes', icon: SparklesIcon, accent: 'cp-card-accent-violet' },
    { to: '/edital-verticalizado', title: 'Edital Verticalizado', desc: 'Conteúdo organizado do edital', icon: DocumentTextIcon, accent: 'cp-card-accent-cyan' },
    { to: '/calendario', title: 'Calendário de Progresso', desc: 'Acompanhe seu estudo', icon: CalendarIcon, accent: 'cp-card-accent-amber' },
    { to: '/guia-mentorado', title: 'Guia Mentorado', desc: 'Cronograma estratégico', icon: LightBulbIcon, accent: 'cp-card-accent-pink' },
    { to: '/vespera-de-prova', title: 'Véspera de Prova', desc: 'Revisão final antes da prova', icon: ClockIcon, accent: 'cp-card-accent-cyan' },
    { to: '/treino-redacao', title: 'Treino de Redação', desc: 'Pratique escrevendo redações', icon: DocumentTextIcon, accent: 'cp-card-accent-violet' },
    { to: '/feed', title: 'FlashSocial', desc: 'Compartilhe com a comunidade', icon: UsersIcon, accent: 'cp-card-accent-amber' },
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
          <Link to="/simulado" className="cp-btn-primary shrink-0 self-start sm:self-auto">
            <TrophyIcon className="h-4 w-4" />
            Fazer simulado
          </Link>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
      >
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className={`cp-card p-4 sm:p-5 ${card.accent}`}>
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10px] text-cp-muted">{card.label}</span>
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${card.iconClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-semibold tracking-tight text-cp-text sm:text-3xl">
                {card.value}
                {card.suffix && (
                  <span className="ml-1 text-sm font-normal text-cp-muted">{card.suffix}</span>
                )}
              </p>
            </div>
          )
        })}
      </motion.div>

      {/* Revisão pendente */}
      {stats.cardsToReview > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="cp-glass-panel mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-mono text-xs text-cp-accent2">revisão pendente</p>
            <p className="mt-1 text-sm text-cp-text">
              <strong>{stats.cardsToReview}</strong> flashcards aguardando revisão
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

      {/* Edital Verticalizado */}
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

