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
  where,
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
import ProgressCalendar from '../components/ProgressCalendar'
import { isTrialMode, getTrialData } from '../utils/trialLimits'
import { motion } from 'framer-motion'
import { DocumentTextIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

dayjs.locale('pt-br')

const Dashboard = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [progressData, setProgressData] = useState([])
  const [saving, setSaving] = useState(false)
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
    const q = query(
      progressRef,
      where('uid', '==', user.uid),
      orderBy('date', 'desc')
    )

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
            if (selectedCourseId) {
              return itemCourseId === selectedCourseId || String(itemCourseId) === String(selectedCourseId)
            } else {
              // Para curso padrão, aceitar null, undefined, string vazia ou 'alego-default'
              return !itemCourseId || itemCourseId === '' || itemCourseId === null || itemCourseId === 'alego-default'
            }
          })

        startTransition(() => {
          setProgressData(data)
          console.log('📊 Progresso sincronizado:', { 
            total: data.length, 
            courseId: selectedCourseId || 'alego',
            dates: data.map(d => d.date).slice(0, 5)
          })
        })
      },
      (error) => {
        console.error('Erro ao carregar progresso:', error)
        setProgressData([])
      }
    )

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
          // Se o card não tem courseId no progresso, assumir que é do curso padrão (null)
          const filteredProgress = {}
          
          // Se temos cards carregados, filtrar pelo curso deles
          allCards.forEach(card => {
            const progress = allCardProgress[card.id]
            if (progress) {
              // Se o card pertence ao curso selecionado, incluir o progresso
              const cardCourseId = card.courseId || null
              const currentCourseId = selectedCourseId || null
              
              // Incluir se o curso do card corresponde ao curso selecionado
              if (cardCourseId === currentCourseId) {
                filteredProgress[card.id] = progress
              }
            }
          })
          
          // Também incluir progressos de cards que ainda não foram carregados mas pertencem ao curso
          Object.keys(allCardProgress).forEach(cardId => {
            if (!filteredProgress[cardId]) {
              const progress = allCardProgress[cardId]
              // Se não temos o card ainda, incluir o progresso (será filtrado depois quando os cards carregarem)
              filteredProgress[cardId] = progress
            }
          })
          
          startTransition(() => {
            setCardProgress(filteredProgress)
            console.log('📊 Card progress sincronizado:', { 
              total: Object.keys(filteredProgress).length, 
              courseId: selectedCourseId || 'alego',
              sample: Object.keys(filteredProgress).slice(0, 3)
            })
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
    
    // Tentar carregar do cache primeiro
    const cacheKey = `flashcards_${selectedCourseId || 'alego'}_${user.uid}`
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        // Usar cache se tiver menos de 5 minutos
        if (now - timestamp < 5 * 60 * 1000 && cachedData) {
          startTransition(() => {
            setAllCards(cachedData)
            setLoading(false)
          })
        }
      }
    } catch (err) {
      console.warn('Erro ao ler cache:', err)
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
            console.warn('Erro ao salvar cache:', err)
          }

          retryCount = 0
        },
        (error) => {
          console.error('Erro ao carregar flashcards:', error)
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
    let currentDate = dayjs().startOf('day')
    
    for (const dateStr of dates) {
      const date = dayjs(dateStr)
      if (date.isSame(currentDate, 'day')) {
        streak++
        currentDate = currentDate.subtract(1, 'day')
      } else if (date.isBefore(currentDate, 'day')) {
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
      dates: dates,
    }
  }, [progressData, cardProgress, allCards])

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
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-lg font-semibold text-alego-600">Carregando dashboard...</p>
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
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-2">
                Dashboard
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                {courseName ? `Acompanhe seu progresso em ${courseName}` : 'Acompanhe seu progresso'}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/flashcards"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-alego-600 to-alego-700 text-white rounded-xl font-semibold hover:from-alego-700 hover:to-alego-800 shadow-lg hover:shadow-xl transition-all"
              >
                <PlayIcon className="h-5 w-5" />
                Estudar Agora
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 shadow-xl"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <FireIcon className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-white/80 text-sm font-semibold mb-1">Sequência</p>
              <p className="text-4xl font-black text-white mb-1">{stats.streak}</p>
              <p className="text-white/70 text-xs">dias consecutivos</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-500 to-green-600 p-6 shadow-xl"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <ClockIcon className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-white/80 text-sm font-semibold mb-1">Horas Estudadas</p>
              <p className="text-4xl font-black text-white mb-1">{stats.totalHours}</p>
              <p className="text-white/70 text-xs">total acumulado</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 p-6 shadow-xl"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <BookOpenIcon className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-white/80 text-sm font-semibold mb-1">Cards Estudados</p>
              <p className="text-4xl font-black text-white mb-1">{stats.studiedCards}</p>
              <p className="text-white/70 text-xs">de {stats.totalCards} total</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 p-6 shadow-xl"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <ChartBarIcon className="h-6 w-6 text-white" />
                </div>
              </div>
              <p className="text-white/80 text-sm font-semibold mb-1">Taxa de Acerto</p>
              <p className="text-4xl font-black text-white mb-1">{stats.accuracy}%</p>
              <p className="text-white/70 text-xs">em revisões</p>
            </div>
          </motion.div>
        </div>

        {/* Edital Verticalizado - Movido para aparecer primeiro */}
        {selectedCourseId && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 mb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <DocumentTextIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Edital Verticalizado
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
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
                <DocumentTextIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-600 dark:text-slate-400">
                  Edital verticalizado ainda não disponível.
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  O administrador precisa fazer upload do edital.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-xl p-6 border border-indigo-200 dark:border-indigo-800">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                        {editalVerticalizado.titulo || 'Edital Verticalizado'}
                      </h4>
                      {editalVerticalizado.descricao && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                          {editalVerticalizado.descricao}
                        </p>
                      )}
                      {editalVerticalizado.updatedAt && (
                        <p className="text-xs text-slate-500 dark:text-slate-500">
                          Atualizado em {editalVerticalizado.updatedAt.toDate?.().toLocaleDateString('pt-BR') || 'Data não disponível'}
                        </p>
                      )}
                    </div>
                  </div>

                  {editalVerticalizado.secoes && editalVerticalizado.secoes.length > 0 ? (
                    <div className="space-y-3">
                      {editalVerticalizado.secoes.slice(0, 5).map((secao, idx) => (
                        <div
                          key={idx}
                          className="bg-white dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600"
                        >
                          <h5 className="font-semibold text-slate-900 dark:text-white mb-2">
                            {secao.titulo}
                          </h5>
                          {secao.conteudo && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                              {secao.conteudo.substring(0, 150)}...
                            </p>
                          )}
                        </div>
                      ))}
                      {editalVerticalizado.secoes.length > 5 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                          +{editalVerticalizado.secoes.length - 5} seções adicionais
                        </p>
                      )}
                    </div>
                  ) : editalVerticalizado.conteudo ? (
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-4 max-h-96 overflow-y-auto">
                      <div
                        className="text-sm text-slate-700 dark:text-slate-300 prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: editalVerticalizado.conteudo.substring(0, 500) + '...' }}
                      />
                    </div>
                  ) : null}

                  <Link
                    to={`/edital-verticalizado?course=${selectedCourseId}`}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all text-sm"
                  >
                    Ver Edital Completo
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Grid Principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Calendário de Progresso */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="lg:col-span-2"
          >
            <ProgressCalendar
              dates={stats.dates}
              streak={stats.streak}
              bySubject={stats.bySubject}
            />
          </motion.div>

          {/* Cards para Revisar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.65 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <ArrowPathIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Para Revisar
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Cards pendentes
                  </p>
                </div>
              </div>
            </div>

            {stats.cardsToReview > 0 ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <p className="text-4xl font-black text-amber-600 dark:text-amber-400 mb-2">
                    {stats.cardsToReview}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {stats.cardsToReview === 1 ? 'card aguardando' : 'cards aguardando'}
                  </p>
                </div>
                <Link
                  to="/flashcards"
                  className="block w-full text-center px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-semibold hover:from-amber-600 hover:to-amber-700 transition-all shadow-lg hover:shadow-xl"
                >
                  Revisar Agora
                  <ArrowRightOutline className="h-4 w-4 inline-block ml-2" />
                </Link>
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <p className="text-slate-600 dark:text-slate-400 font-medium">
                  Todos os cards estão em dia!
                </p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Progresso por Matéria */}
        {stats.bySubject && Object.keys(stats.bySubject).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 mb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <AcademicCapIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Progresso por Matéria
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Acompanhe seu avanço em cada área
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(stats.bySubject)
                .sort((a, b) => b[1].percentage - a[1].percentage)
                .map(([materia, materiaStats]) => {
                  const percentage = materiaStats.percentage
                  const studied = materiaStats.studiedCards
                  const total = materiaStats.totalCards

                  return (
                    <div
                      key={materia}
                      className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border border-slate-200 dark:border-slate-600"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                          {materia}
                        </h4>
                        <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                          {percentage}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2 mb-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {studied} de {total} cards estudados
                      </p>
                    </div>
                  )
                })}
            </div>
          </motion.div>
        )}

        {/* Links Rápidos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <Link
            to="/flashcards"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <BookOpenIcon className="h-8 w-8 text-white mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">Flashcards</h3>
              <p className="text-white/80 text-sm">Estude com repetição espaçada</p>
              <ArrowRightOutline className="h-5 w-5 text-white mt-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/flashquestoes"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <LightBulbIcon className="h-8 w-8 text-white mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">FlashQuestões</h3>
              <p className="text-white/80 text-sm">Questões geradas por IA</p>
              <ArrowRightOutline className="h-5 w-5 text-white mt-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/simulado"
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-6 shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <TrophyIcon className="h-8 w-8 text-white mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">Simulado</h3>
              <p className="text-white/80 text-sm">Teste seus conhecimentos</p>
              <ArrowRightOutline className="h-5 w-5 text-white mt-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

        </motion.div>
      </div>
    </div>
  )
}

export default Dashboard

