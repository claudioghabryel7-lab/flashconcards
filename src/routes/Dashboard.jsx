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
import { useDarkMode } from '../hooks/useDarkMode.jsx'
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
  const { darkMode } = useDarkMode()
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-accent-orange border-t-transparent"></div>
          <p className="mt-4 text-lg font-semibold text-text-secondary">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-text-primary mb-2">
                Dashboard
              </h1>
              <p className="text-text-secondary">
                {courseName ? `Acompanhe seu progresso em ${courseName}` : 'Acompanhe seu progresso'}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/simulado"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-orange to-accent-cyan text-background-primary rounded-xl font-semibold hover:from-accent-orange-dim hover:to-accent-cyan-dim shadow-lg hover:shadow-xl transition-all"
              >
                <TrophyIcon className="h-5 w-5" />
                Fazer Simulado
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Botões de Instalação PWA */}
        <div className="mb-6">
          <InstallPWAButton />
        </div>

        
        {/* Edital Verticalizado */}
        {selectedCourseId && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="bg-background-card rounded-xl sm:rounded-2xl shadow-lg border border-border-primary p-4 sm:p-6 mb-6 sm:mb-8"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <DocumentTextIcon className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                    Edital Verticalizado
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Edital organizado para estudos
                  </p>
                </div>
              </div>
            </div>

            {loadingEdital ? (
              <div className="text-center py-4">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-alego-600 border-t-transparent"></div>
              </div>
            ) : !editalVerticalizado ? (
              <div className="text-center py-8">
                <DocumentTextIcon className="h-12 w-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">
                  Edital verticalizado ainda não disponível.
                </p>
                <p className="text-xs text-text-muted mt-1">
                  O administrador precisa fazer upload do edital.
                </p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                <div className="bg-background-card-hover rounded-lg sm:rounded-xl p-4 sm:p-6 border border-border-primary">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base sm:text-lg font-bold text-text-primary mb-2 break-words">
                        {editalVerticalizado.titulo || 'Edital Verticalizado'}
                      </h4>
                      {editalVerticalizado.descricao && (
                        <p className="text-xs sm:text-sm text-text-secondary mb-2 sm:mb-3 break-words">
                          {editalVerticalizado.descricao}
                        </p>
                      )}
                      {editalVerticalizado.updatedAt && (
                        <p className="text-xs text-text-muted">
                          Atualizado em {editalVerticalizado.updatedAt.toDate?.().toLocaleDateString('pt-BR') || 'Data não disponível'}
                        </p>
                      )}
                    </div>
                  </div>

                  {editalVerticalizado.secoes && editalVerticalizado.secoes.length > 0 ? (
                    <div className="space-y-2 sm:space-y-3">
                      {editalVerticalizado.secoes.slice(0, 5).map((secao, idx) => (
                        <div
                          key={idx}
                          className="bg-background-card rounded-lg p-3 sm:p-4 border border-border-primary"
                        >
                          <h5 className="font-semibold text-sm sm:text-base text-text-primary mb-2 break-words">
                            {secao.titulo}
                          </h5>
                          {secao.conteudo && (
                            <p className="text-xs sm:text-sm text-text-secondary line-clamp-2 break-words">
                              {secao.conteudo.substring(0, 150)}...
                            </p>
                          )}
                        </div>
                      ))}
                      {editalVerticalizado.secoes.length > 5 && (
                        <p className="text-xs text-text-muted text-center">
                          +{editalVerticalizado.secoes.length - 5} seções adicionais
                        </p>
                      )}
                    </div>
                  ) : editalVerticalizado.conteudo ? (
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-3 sm:p-4 max-h-64 sm:max-h-96 overflow-y-auto">
                      <div
                        className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 prose prose-sm dark:prose-invert max-w-none break-words"
                        dangerouslySetInnerHTML={{ __html: editalVerticalizado.conteudo.substring(0, 500) + '...' }}
                      />
                    </div>
                  ) : null}

                  <Link
                    to={`/edital-verticalizado?course=${selectedCourseId}`}
                    className="mt-3 sm:mt-4 inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-accent-orange text-background-primary rounded-lg font-semibold hover:bg-accent-orange-dim transition-all text-xs sm:text-sm w-full sm:w-auto justify-center"
                  >
                    Ver Edital Completo
                    <ChevronRightIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Link>
                </div>
              </div>
            )}
          </motion.div>
        )}




        
        {/* Links Rápidos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <Link
            to="/flashcards"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-accent-orange to-accent-cyan p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-background-primary/10 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <SparklesIcon className="h-8 w-8 text-background-primary mb-3" />
              <h3 className="text-lg font-bold text-background-primary mb-1">Flashcards com IA</h3>
              <p className="text-background-primary/80 text-sm">Estude com flashcards inteligentes</p>
              <ArrowRightOutline className="h-5 w-5 text-background-primary mt-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/edital-verticalizado"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-accent-cyan to-accent-orange p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-background-primary/10 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <DocumentTextIcon className="h-8 w-8 text-background-primary mb-3" />
              <h3 className="text-lg font-bold text-background-primary mb-1">Edital Verticalizado</h3>
              <p className="text-background-primary/80 text-sm">Conteúdo organizado do edital</p>
              <ArrowRightOutline className="h-5 w-5 text-background-primary mt-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/calendario"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-accent-orange to-accent-cyan p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-background-primary/10 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <CalendarIcon className="h-8 w-8 text-background-primary mb-3" />
              <h3 className="text-lg font-bold text-background-primary mb-1">Calendário de Progresso</h3>
              <p className="text-background-primary/80 text-sm">Acompanhe seu estudo</p>
              <ArrowRightOutline className="h-5 w-5 text-background-primary mt-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/guia-mentorado"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-background-primary/10 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <SparklesIcon className="h-8 w-8 text-background-primary mb-3" />
              <h3 className="text-lg font-bold text-background-primary mb-1">Guia Mentorado</h3>
              <p className="text-background-primary/80 text-sm">Cronograma estratégico</p>
              <ArrowRightOutline className="h-5 w-5 text-background-primary mt-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/vespera-de-prova"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-accent-cyan to-accent-orange p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-background-primary/10 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <ClockIcon className="h-8 w-8 text-background-primary mb-3" />
              <h3 className="text-lg font-bold text-background-primary mb-1">Véspera de Prova</h3>
              <p className="text-background-primary/80 text-sm">Revisão final antes da prova</p>
              <ArrowRightOutline className="h-5 w-5 text-background-primary mt-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/treino-redacao"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-accent-orange to-accent-cyan p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-background-primary/10 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <DocumentTextIcon className="h-8 w-8 text-background-primary mb-3" />
              <h3 className="text-lg font-bold text-background-primary mb-1">Treino de Redação</h3>
              <p className="text-background-primary/80 text-sm">Pratique escrevendo redações</p>
              <ArrowRightOutline className="h-5 w-5 text-background-primary mt-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/feed"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-accent-cyan to-accent-orange p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-background-primary/10 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <UsersIcon className="h-8 w-8 text-background-primary mb-3" />
              <h3 className="text-lg font-bold text-background-primary mb-1">FlashSocial</h3>
              <p className="text-background-primary/80 text-sm">Compartilhe com a comunidade</p>
              <ArrowRightOutline className="h-5 w-5 text-background-primary mt-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

        </motion.div>

        {/* Gráfico de Tempo de Estudo - TEMPORARIAMENTE DESATIVADO */}
        {/* <div className="mt-8">
          <StudyTimeChart userId={user?.uid} />
        </div> */}
      </div>

      {/* LGPD Consent Banner */}
      <LGPDConsent />
    </div>
  )
}

export default Dashboard

