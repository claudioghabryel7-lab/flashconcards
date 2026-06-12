import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import {
  CalendarIcon,
  BookOpenIcon,
  SparklesIcon,
  DocumentTextIcon,
  PencilIcon,
  ChevronRightIcon,
  ClockIcon,
  ChartBarIcon,
  XMarkIcon,
  CheckIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import dayjs from 'dayjs'

const Mentoria = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [loading, setLoading] = useState(true)
  const [examDate, setExamDate] = useState(null)
  const [daysRemaining, setDaysRemaining] = useState(0)
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [userProgress, setUserProgress] = useState(null)
  const [courseId, setCourseId] = useState(null)
  const [flashcardsCount, setFlashcardsCount] = useState(0)
  
  // Estados para modal de data da prova
  const [examDateModalOpen, setExamDateModalOpen] = useState(false)
  const [tempExamDate, setTempExamDate] = useState('')
  const [savingExamDate, setSavingExamDate] = useState(false)
  
  // Estados para meta de hoje
  const [todayTopics, setTodayTopics] = useState([])
  const [changingTopicIndex, setChangingTopicIndex] = useState(null)
  const [topicSelectorOpen, setTopicSelectorOpen] = useState(false)

  useEffect(() => {
    if (!user) return

    const loadData = async () => {
      try {
        setLoading(true)

        // Carregar data da prova do perfil
        const userRef = doc(db, 'users', user.uid)
        const userDoc = await getDoc(userRef)
        if (userDoc.exists()) {
          const userData = userDoc.data()
          if (userData.examDate) {
            setExamDate(userData.examDate)
            const days = Math.ceil((new Date(userData.examDate) - new Date()) / (1000 * 60 * 60 * 24))
            setDaysRemaining(days)
          }
        }

        // Carregar curso selecionado
        const selectedCourseId = profile?.selectedCourseId || 'alego-default'
        setCourseId(selectedCourseId)

        // Carregar edital verticalizado
        const editalRef = doc(db, 'courses', selectedCourseId, 'editalVerticalizado', 'principal')
        const editalDoc = await getDoc(editalRef)
        if (editalDoc.exists()) {
          const editalData = editalDoc.data()
          
          // Verificar se o edital está dividido em partes
          if (editalData.temPartes && editalData.totalPartes > 1) {
            const { collection, getDocs, query, orderBy } = await import('firebase/firestore')
            const partesRef = collection(db, 'courses', selectedCourseId, 'editalVerticalizado', 'principal', 'partes')
            const partesSnapshot = await getDocs(query(partesRef, orderBy('parte')))
            
            const todasDisciplinas = [...(editalData.disciplinas || [])]
            partesSnapshot.forEach((doc) => {
              const parteData = doc.data()
              if (parteData.disciplinas && Array.isArray(parteData.disciplinas)) {
                todasDisciplinas.push(...parteData.disciplinas)
              }
            })
            
            setEditalVerticalizado({
              ...editalData,
              disciplinas: todasDisciplinas,
            })
          } else {
            setEditalVerticalizado(editalData)
          }
        }

        // Carregar progresso do usuário
        const progressRef = doc(db, 'userEditalProgress', user.uid, 'courses', selectedCourseId)
        const progressDoc = await getDoc(progressRef)
        if (progressDoc.exists()) {
          const progressData = progressDoc.data().progress || {}
          setUserProgress(progressData)
        }

        // Carregar contagem de flashcards
        const flashcardsRef = collection(db, 'courses', selectedCourseId, 'flashcards')
        const flashcardsSnapshot = await getDocs(flashcardsRef)
        setFlashcardsCount(flashcardsSnapshot.size)

        // Calcular meta de hoje (3 tópicos não estudados)
        // Usar editalData localmente antes de definir o estado
        let editalDataLocal = null
        if (editalDoc.exists()) {
          editalDataLocal = editalDoc.data()
          
          // Verificar se o edital está dividido em partes
          if (editalDataLocal.temPartes && editalDataLocal.totalPartes > 1) {
            const { collection: collectionImport, getDocs: getDocsImport, query, orderBy } = await import('firebase/firestore')
            const partesRef = collectionImport(db, 'courses', selectedCourseId, 'editalVerticalizado', 'principal', 'partes')
            const partesSnapshot = await getDocsImport(query(partesRef, orderBy('parte')))
            
            const todasDisciplinas = [...(editalDataLocal.disciplinas || [])]
            partesSnapshot.forEach((doc) => {
              const parteData = doc.data()
              if (parteData.disciplinas && Array.isArray(parteData.disciplinas)) {
                todasDisciplinas.push(...parteData.disciplinas)
              }
            })
            
            editalDataLocal = {
              ...editalDataLocal,
              disciplinas: todasDisciplinas,
            }
          }
        }

        if (editalDataLocal?.disciplinas) {
          const uncompletedTopics = []
          const progressData = progressDoc.exists() ? (progressDoc.data().progress || {}) : {}
          
          editalDataLocal.disciplinas.forEach((disciplina) => {
            if (disciplina.topicos) {
              disciplina.topicos.forEach((topico) => {
                const topicKey = `${topico.numero || ''} :: ${topico.nome || ''}`
                const progress = progressData[encodeURIComponent(topicKey)] || progressData[topicKey]
                if (!progress?.estudado) {
                  uncompletedTopics.push({
                    disciplina: disciplina.nome,
                    topico: topico,
                    topicKey
                  })
                }
              })
            }
          })
          
          setTodayTopics(uncompletedTopics.slice(0, 3))
        }
      } catch (error) {
        console.error('Erro ao carregar dados da mentoria:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, profile])

  // Calcular progresso por disciplina
  const calculateDisciplinaProgress = (disciplina) => {
    if (!disciplina.topicos || !userProgress) return { completed: 0, total: 0, percentage: 0 }

    let completed = 0
    let total = disciplina.topicos.length

    disciplina.topicos.forEach((topico) => {
      const topicKey = `${topico.numero || ''} :: ${topico.nome || ''}`
      const progress = userProgress[encodeURIComponent(topicKey)] || userProgress[topicKey]
      if (progress?.estudado) {
        completed++
      }
    })

    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    }
  }

  // Calcular progresso geral
  const calculateOverallProgress = () => {
    if (!editalVerticalizado?.disciplinas || !userProgress) return { completed: 0, total: 0, percentage: 0 }

    let completed = 0
    let total = 0

    editalVerticalizado.disciplinas.forEach((disciplina) => {
      if (disciplina.topicos) {
        disciplina.topicos.forEach((topico) => {
          const topicKey = `${topico.numero || ''} :: ${topico.nome || ''}`
          const progress = userProgress[encodeURIComponent(topicKey)] || userProgress[topicKey]
          total++
          if (progress?.estudado) {
            completed++
          }
        })
      }
    })

    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    }
  }

  // Calcular ritmo de estudo necessário
  const calculateRequiredPace = () => {
    const overall = calculateOverallProgress()
    const remaining = overall.total - overall.completed
    if (daysRemaining <= 0 || remaining <= 0) return { perDay: 0, perWeek: 0 }

    const perDay = Math.ceil(remaining / daysRemaining)
    const perWeek = Math.ceil(remaining / (daysRemaining / 7))

    return { perDay, perWeek }
  }

  // Função para salvar data da prova
  const handleSaveExamDate = async () => {
    if (!user || !tempExamDate) return

    try {
      setSavingExamDate(true)
      const userRef = doc(db, 'users', user.uid)
      await updateDoc(userRef, {
        examDate: tempExamDate
      })
      setExamDate(tempExamDate)
      const days = Math.ceil((new Date(tempExamDate) - new Date()) / (1000 * 60 * 60 * 24))
      setDaysRemaining(days)
      setExamDateModalOpen(false)
    } catch (error) {
      console.error('Erro ao salvar data da prova:', error)
    } finally {
      setSavingExamDate(false)
    }
  }

  // Calcular plano de estudo diário
  const calculateDailyPlan = () => {
    if (!editalVerticalizado?.disciplinas || daysRemaining <= 0) return []

    const overall = calculateOverallProgress()
    const remaining = overall.total - overall.completed
    const topicsPerDay = Math.ceil(remaining / daysRemaining)

    // Encontrar tópicos não estudados
    const uncompletedTopics = []
    editalVerticalizado.disciplinas.forEach((disciplina) => {
      if (disciplina.topicos) {
        disciplina.topicos.forEach((topico) => {
          const topicKey = `${topico.numero || ''} :: ${topico.nome || ''}`
          const progress = userProgress?.[encodeURIComponent(topicKey)] || userProgress?.[topicKey]
          if (!progress?.estudado) {
            uncompletedTopics.push({
              disciplina: disciplina.nome,
              topico: topico,
              topicKey
            })
          }
        })
      }
    })

    // Distribuir tópicos nos dias restantes
    const dailyPlan = []
    for (let day = 1; day <= Math.min(daysRemaining, 7); day++) {
      const startIndex = (day - 1) * topicsPerDay
      const dayTopics = uncompletedTopics.slice(startIndex, startIndex + topicsPerDay)
      
      if (dayTopics.length > 0) {
        dailyPlan.push({
          day,
          date: dayjs().add(day - 1, 'day').format('DD/MM'),
          topics: dayTopics,
          activities: [
            { type: 'flashcards', title: 'Revisar Flashcards', icon: SparklesIcon },
            { type: 'questoes', title: 'Praticar Questões', icon: BookOpenIcon },
            { type: 'redacao', title: 'Treinar Redação', icon: PencilIcon },
          ]
        })
      }
    }

    return dailyPlan
  }

  // Função para marcar tópico como concluído e carregar próxima matéria
  const handleCompleteTopic = async (topicKey) => {
    if (!user || !courseId) return

    try {
      const progressRef = doc(db, 'userEditalProgress', user.uid, 'courses', courseId)
      const progressDoc = await getDoc(progressRef)
      
      let currentProgress = {}
      if (progressDoc.exists()) {
        currentProgress = progressDoc.data().progress || {}
      }

      await updateDoc(progressRef, {
        progress: {
          ...currentProgress,
          [encodeURIComponent(topicKey)]: {
            estudado: true,
            dataEstudo: new Date().toISOString()
          }
        }
      })

      // Recarregar dados
      const newData = await getDoc(progressRef)
      if (newData.exists()) {
        setUserProgress(newData.data().progress || {})
      }

      // Remover tópico da lista de hoje
      setTodayTopics(prev => {
        const newTopics = prev.filter(t => t.topicKey !== topicKey)
        
        // Se ainda há tópicos não estudados, adicionar o próximo automaticamente
        if (newTopics.length === 0 && editalVerticalizado?.disciplinas) {
          const uncompletedTopics = []
          editalVerticalizado.disciplinas.forEach((disciplina) => {
            if (disciplina.topicos) {
              disciplina.topicos.forEach((topico) => {
                const tKey = `${topico.numero || ''} :: ${topico.nome || ''}`
                const progress = newData.data().progress?.[encodeURIComponent(tKey)] || newData.data().progress?.[tKey]
                if (!progress?.estudado) {
                  uncompletedTopics.push({
                    disciplina: disciplina.nome,
                    topico: topico,
                    topicKey: tKey
                  })
                }
              })
            }
          })
          
          if (uncompletedTopics.length > 0) {
            return [uncompletedTopics[0]]
          }
        }
        
        return newTopics
      })
    } catch (error) {
      console.error('Erro ao marcar tópico como concluído:', error)
    }
  }

  // Função para alterar tópico
  const handleChangeTopic = (index, newTopic) => {
    setTodayTopics(prev => {
      const newTopics = [...prev]
      newTopics[index] = newTopic
      return newTopics
    })
    setTopicSelectorOpen(false)
    setChangingTopicIndex(null)
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-lg font-semibold text-alego-600">Carregando mentoria...</p>
        </div>
      </div>
    )
  }

  const overallProgress = calculateOverallProgress()
  const requiredPace = calculateRequiredPace()
  const isIntensiveMode = daysRemaining <= 15
  
  // Calcular dias desde o início (para recomendações de redação e simulado)
  const daysSinceStart = (79 - daysRemaining) + 1 // Assumindo que começou há 79 dias atrás
  const shouldRecommendRedacao = daysSinceStart % 5 === 0
  const shouldRecommendSimulado = daysSinceStart % 6 === 0

  return (
    <div className="min-h-screen py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-2">
            🎓 Minha Mentoria
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {isIntensiveMode ? '🔥 Modo Intensivo de Revisão' : 'Plano personalizado de estudos'}
          </p>
        </div>

        {!examDate ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-8 text-center">
            <CalendarIcon className="h-16 w-16 text-alego-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Defina a Data da Prova
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Para criar seu plano de estudo personalizado, precisamos saber quando é sua prova.
            </p>
            <button
              onClick={() => {
                setTempExamDate(examDate || '')
                setExamDateModalOpen(true)
              }}
              className="px-6 py-3 bg-alego-600 text-white rounded-xl font-semibold hover:bg-alego-700 transition-colors"
            >
              Definir Data da Prova
            </button>
          </div>
        ) : (
          <>
            {/* Cards de Informações */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Dias Restantes */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <ClockIcon className="h-6 w-6 text-alego-600 dark:text-alego-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Dias restantes</span>
                </div>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{daysRemaining}</p>
              </div>

              {/* Progresso */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <ChartBarIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Progresso</span>
                </div>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{overallProgress.percentage}%</p>
              </div>

              {/* Matérias Restantes */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <BookOpenIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Matérias restantes</span>
                </div>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{overallProgress.total - overallProgress.completed}</p>
              </div>
            </div>

            {/* Meta de Hoje */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                🎯 Estudar Hoje
              </h2>
              
              {todayTopics.length > 0 ? (
                <div className="space-y-3">
                  {todayTopics.map((topic, idx) => (
                    <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-slate-900 dark:text-white">
                          {topic.disciplina}: {topic.topico.nome}
                        </h3>
                        <button
                          onClick={() => {
                            setChangingTopicIndex(idx)
                            setTopicSelectorOpen(true)
                          }}
                          className="text-sm text-alego-600 dark:text-alego-400 hover:underline"
                        >
                          Alterar
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCompleteTopic(topic.topicKey)}
                          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                        >
                          ✓ Concluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-600 dark:text-slate-400 mb-4">
                    {isIntensiveMode ? 'Hora de revisar tudo!' : 'Todos os tópicos foram estudados! 🎉'}
                  </p>
                  {!isIntensiveMode && (
                    <button
                      onClick={() => setTodayTopics([])}
                      className="px-4 py-2 bg-alego-600 text-white rounded-lg text-sm font-medium hover:bg-alego-700 transition-colors"
                    >
                      Começar Revisão
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Recomendações Especiais */}
            {(shouldRecommendRedacao || shouldRecommendSimulado) && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                  ⚡ Recomendação do Dia
                </h2>
                
                <div className="space-y-3">
                  {shouldRecommendRedacao && (
                    <Link
                      to="/treino-redacao"
                      className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                    >
                      <PencilIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">Treinar Redação</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Dia de redação - pratique sua escrita!</p>
                      </div>
                      <ChevronRightIcon className="h-5 w-5 text-slate-400 ml-auto" />
                    </Link>
                  )}
                  
                  {shouldRecommendSimulado && (
                    <Link
                      to="/simulado"
                      className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <BookOpenIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">Fazer Simulado</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Dia de simulado - teste seus conhecimentos!</p>
                      </div>
                      <ChevronRightIcon className="h-5 w-5 text-slate-400 ml-auto" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Data da Prova */}
            <div className="bg-gradient-to-r from-alego-600 to-alego-700 rounded-2xl p-6 text-white">
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-8 w-8" />
                <div>
                  <p className="text-sm opacity-90">Data da Prova</p>
                  <p className="text-lg font-bold">
                    {dayjs(examDate).format('DD [de] MMMM [de] YYYY')}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Modal para definir data da prova */}
        {examDateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setExamDateModalOpen(false)} />
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Data da Prova
                </h2>
                <button
                  onClick={() => setExamDateModalOpen(false)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <XMarkIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </button>
              </div>
              
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Defina a data da sua prova para que possamos criar um plano de estudo personalizado e calcular o tempo restante.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Data da Prova
                </label>
                <input
                  type="date"
                  value={tempExamDate}
                  onChange={(e) => setTempExamDate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-alego-500 focus:border-transparent"
                />
              </div>

              {tempExamDate && (
                <div className="mb-4 p-3 bg-alego-50 dark:bg-alego-900/20 rounded-lg">
                  <p className="text-sm font-medium text-alego-700 dark:text-alego-300">
                    Dias restantes: {Math.ceil((new Date(tempExamDate) - new Date()) / (1000 * 60 * 60 * 24))}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setExamDateModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveExamDate}
                  disabled={!tempExamDate || savingExamDate}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-alego-600 text-white hover:bg-alego-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {savingExamDate ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal para selecionar tópico */}
        {topicSelectorOpen && editalVerticalizado?.disciplinas && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setTopicSelectorOpen(false)} />
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Selecionar Novo Tópico
                </h2>
                <button
                  onClick={() => setTopicSelectorOpen(false)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <XMarkIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </button>
              </div>
              
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Escolha um novo tópico para substituir a sugestão atual.
              </p>

              <div className="space-y-4">
                {editalVerticalizado.disciplinas.map((disciplina, dIdx) => (
                  <div key={dIdx}>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                      {disciplina.nome}
                    </h3>
                    <div className="space-y-2">
                      {disciplina.topicos?.map((topico, tIdx) => {
                        const topicKey = `${topico.numero || ''} :: ${topico.nome || ''}`
                        const progress = userProgress?.[encodeURIComponent(topicKey)] || userProgress?.[topicKey]
                        const isStudied = progress?.estudado
                        
                        return (
                          <button
                            key={tIdx}
                            onClick={() => handleChangeTopic(changingTopicIndex, {
                              disciplina: disciplina.nome,
                              topico: topico,
                              topicKey
                            })}
                            disabled={isStudied}
                            className={`w-full text-left p-3 rounded-lg transition-colors ${
                              isStudied
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>
                                {topico.numero && `${topico.numero} - `}{topico.nome}
                              </span>
                              {isStudied && (
                                <CheckIcon className="h-4 w-4 text-green-600" />
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Mentoria
