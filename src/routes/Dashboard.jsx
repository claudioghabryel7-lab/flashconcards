import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
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
} from '@heroicons/react/24/solid'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import ProgressCalendar from '../components/ProgressCalendar'

const MATERIAS = [
  'Português',
  'Área de Atuação (PL)',
  'Raciocínio Lógico',
  'Constitucional',
  'Administrativo',
  'Legislação Estadual',
  'Realidade de Goiás',
  'Redação',
]

const Dashboard = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [progressData, setProgressData] = useState([])
  const [saving, setSaving] = useState(false)
  const [cardProgress, setCardProgress] = useState({})
  const [allCards, setAllCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [studyStats, setStudyStats] = useState({
    totalDays: 0,
    totalHours: 0,
    bySubject: {},
  })
  const [studiedModules, setStudiedModules] = useState({}) // { materia: { modulo: true } }
  const [suggestedModule, setSuggestedModule] = useState(null) // { materia, modulo }
  const [studyPhase, setStudyPhase] = useState(1) // Fase atual (1, 2, 3...)
  const [expandedMaterias, setExpandedMaterias] = useState({}) // { materia: true/false }

  // Carregar todos os flashcards
  useEffect(() => {
    const cardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(
      cardsRef,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setAllCards(data)
        setLoading(false)
      },
      (error) => {
        console.error('Erro ao carregar flashcards:', error)
        setAllCards([])
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  // Carregar progresso dos cards do usuário
  useEffect(() => {
    if (!user) return () => {}
    
    const userProgressRef = doc(db, 'userProgress', user.uid)
    const unsub = onSnapshot(
      userProgressRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          setCardProgress(data.cardProgress || {})
          setStudiedModules(data.studiedModules || {})
          setStudyPhase(data.studyPhase || 1)
        } else {
          setCardProgress({})
          setStudiedModules({})
          setStudyPhase(1)
        }
      },
      (error) => {
        console.error('Erro ao carregar progresso dos cards:', error)
        setCardProgress({})
        setStudiedModules({})
        setStudyPhase(1)
      }
    )
    return () => unsub()
  }, [user])

  useEffect(() => {
    if (!user) return () => {}
    
    const progressRef = collection(db, 'progress')
    const q = query(
      progressRef,
      where('uid', '==', user.uid),
      orderBy('date', 'desc'),
    )
    
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }))
        setProgressData(data)
      },
      (error) => {
        // Se der erro de índice, tentar sem orderBy
        if (error.code === 'failed-precondition') {
          console.warn('Índice do Firestore não criado. Usando query sem orderBy.')
          const qSimple = query(progressRef, where('uid', '==', user.uid))
          onSnapshot(
            qSimple,
            (snapshot) => {
              const data = snapshot.docs.map((docSnapshot) => ({
                id: docSnapshot.id,
                ...docSnapshot.data(),
              }))
              // Ordenar manualmente por data
              data.sort((a, b) => {
                if (!a.date || !b.date) return 0
                return b.date.localeCompare(a.date)
              })
              setProgressData(data)
            },
            (err) => console.error('Erro ao carregar progresso:', err)
          )
        } else {
          console.error('Erro ao carregar progresso:', error)
        }
      }
    )
    
    return () => unsub()
  }, [user])

  // Organizar matérias e módulos dos flashcards
  const organizedModules = useMemo(() => {
    const organized = {}
    allCards.forEach((card) => {
      if (card.materia && card.modulo) {
        if (!organized[card.materia]) {
          organized[card.materia] = new Set()
        }
        organized[card.materia].add(card.modulo)
      }
    })
    
    // Converter Sets para Arrays e ordenar
    const result = {}
    Object.keys(organized).forEach((materia) => {
      result[materia] = Array.from(organized[materia]).sort((a, b) => {
        // Extrair números dos módulos para ordenação numérica
        const numA = parseInt(a.match(/\d+/)?.[0] || '0')
        const numB = parseInt(b.match(/\d+/)?.[0] || '0')
        if (numA !== numB) return numA - numB
        return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
      })
    })
    return result
  }, [allCards])

  // Calcular estatísticas de módulos
  const modulesStats = useMemo(() => {
    let totalModules = 0
    let studiedCount = 0
    
    Object.keys(organizedModules).forEach((materia) => {
      const modulos = organizedModules[materia] || []
      totalModules += modulos.length
      
      modulos.forEach((modulo) => {
        if (studiedModules[materia]?.[modulo] === true) {
          studiedCount++
        }
      })
    })
    
    const remaining = totalModules - studiedCount
    const daysRemaining = remaining // 1 módulo por dia
    
    return {
      total: totalModules,
      studied: studiedCount,
      remaining,
      daysRemaining,
      percentage: totalModules > 0 ? Math.round((studiedCount / totalModules) * 100) : 0
    }
  }, [organizedModules, studiedModules])

  // Calcular progresso do módulo sugerido
  const moduleProgress = useMemo(() => {
    if (!suggestedModule || !allCards.length) return { studied: 0, total: 0, percentage: 0 }
    
    const cardsInModule = allCards.filter(
      card => card.materia === suggestedModule.materia && card.modulo === suggestedModule.modulo
    )
    
    const studiedCards = cardsInModule.filter(card => {
      const progress = cardProgress[card.id]
      return progress && progress.reviewCount > 0
    })
    
    return {
      studied: studiedCards.length,
      total: cardsInModule.length,
      percentage: cardsInModule.length > 0 ? Math.round((studiedCards.length / cardsInModule.length) * 100) : 0
    }
  }, [suggestedModule, allCards, cardProgress])

  // Sugerir próximo módulo para estudar
  useEffect(() => {
    if (!organizedModules || Object.keys(organizedModules).length === 0) {
      setSuggestedModule(null)
      return
    }

    // Encontrar o primeiro módulo não estudado, seguindo ordem das matérias e módulos
    for (const materia of MATERIAS) {
      const modulos = organizedModules[materia] || []
      if (modulos.length === 0) continue

      for (const modulo of modulos) {
        const isStudied = studiedModules[materia]?.[modulo] === true
        if (!isStudied) {
          setSuggestedModule({ materia, modulo })
          return
        }
      }
    }

    // Se todos foram estudados, sugerir o primeiro módulo da primeira matéria
    const firstMateria = MATERIAS.find(m => organizedModules[m]?.length > 0)
    if (firstMateria && organizedModules[firstMateria]?.length > 0) {
      setSuggestedModule({
        materia: firstMateria,
        modulo: organizedModules[firstMateria][0]
      })
    } else {
      setSuggestedModule(null)
    }
  }, [organizedModules, studiedModules])

  // Marcar módulo como estudado
  const markModuleAsStudied = async () => {
    if (!user || !suggestedModule) return

    try {
      const userProgressRef = doc(db, 'userProgress', user.uid)
      const currentData = await getDoc(userProgressRef)
      let currentStudiedModules = currentData.exists() 
        ? (currentData.data().studiedModules || {})
        : {}
      const currentPhase = currentData.exists() 
        ? (currentData.data().studyPhase || 1)
        : 1

      // Atualizar estrutura - marcar módulo atual como estudado
      if (!currentStudiedModules[suggestedModule.materia]) {
        currentStudiedModules[suggestedModule.materia] = {}
      }
      currentStudiedModules[suggestedModule.materia][suggestedModule.modulo] = true

      // Verificar se todos os módulos foram estudados (após marcar o atual)
      let allStudied = true
      Object.keys(organizedModules).forEach((materia) => {
        const modulos = organizedModules[materia] || []
        modulos.forEach((modulo) => {
          if (!currentStudiedModules[materia]?.[modulo]) {
            allStudied = false
          }
        })
      })

      // Se todos foram estudados, resetar e incrementar fase
      if (allStudied) {
        // Resetar todos os módulos estudados para começar nova fase
        const resetModules = {}
        Object.keys(organizedModules).forEach((materia) => {
          resetModules[materia] = {}
          organizedModules[materia].forEach((modulo) => {
            resetModules[materia][modulo] = false
          })
        })
        
        await setDoc(userProgressRef, {
          studiedModules: resetModules,
          studyPhase: currentPhase + 1,
          updatedAt: serverTimestamp(),
        }, { merge: true })

        setStudiedModules(resetModules)
        setStudyPhase(currentPhase + 1)
      } else {
        await setDoc(userProgressRef, {
          studiedModules: currentStudiedModules,
          studyPhase: currentPhase,
          updatedAt: serverTimestamp(),
        }, { merge: true })

        setStudiedModules(currentStudiedModules)
      }
    } catch (err) {
      console.error('Erro ao marcar módulo como estudado:', err)
    }
  }

      // Calcular estatísticas baseadas em cards estudados
      useEffect(() => {
        // Horas dos dias registrados (tempo real rastreado)
        const hoursFromDays = progressData.reduce((sum, item) => {
          const hours = parseFloat(item.hours || 0)
          return sum + hours
        }, 0)
        
        console.log('📊 Atualizando estatísticas:', { 
          progressDataLength: progressData.length, 
          hoursFromDays: hoursFromDays.toFixed(2) 
        })
        
        const stats = {
          totalDays: progressData.length,
          totalHours: hoursFromDays, // Usar apenas horas reais do Firestore (rastreadas pelo timer)
          bySubject: {},
        }
    
    // Inicializar todas as matérias
    MATERIAS.forEach((materia) => {
      stats.bySubject[materia] = {
        days: 0,
        hours: 0,
        totalCards: 0,
        studiedCards: 0,
        percentage: 0,
      }
    })
    
    // Contar cards por matéria e calcular progresso
    allCards.forEach((card) => {
      if (card.materia && stats.bySubject[card.materia]) {
        stats.bySubject[card.materia].totalCards += 1
        const progress = cardProgress[card.id]
        if (progress && progress.reviewCount > 0) {
          stats.bySubject[card.materia].studiedCards += 1
          // Horas por matéria serão calculadas proporcionalmente ao tempo total
          // Por enquanto, não adicionamos horas por matéria individualmente
        }
      }
    })
    
    // Calcular porcentagem por matéria
    MATERIAS.forEach((materia) => {
      const subj = stats.bySubject[materia]
      if (subj.totalCards > 0) {
        subj.percentage = Math.round((subj.studiedCards / subj.totalCards) * 100)
      }
    })
    
    setStudyStats(stats)
  }, [allCards, cardProgress, progressData])

  const progressDates = useMemo(() => {
    return progressData.map((item) => item.date).filter(Boolean)
  }, [progressData])

  const streak = useMemo(() => {
    if (progressDates.length === 0) return 0
    const studiedSet = new Set(progressDates)
    let count = 0
    let cursor = dayjs().startOf('day')
    
    // Verificar se hoje estudou
    const todayKey = cursor.format('YYYY-MM-DD')
    if (!studiedSet.has(todayKey)) {
      // Se não estudou hoje, verifica desde ontem
      cursor = cursor.subtract(1, 'day')
    }
    
    // Contar dias consecutivos retrocedendo
    while (studiedSet.has(cursor.format('YYYY-MM-DD'))) {
      count += 1
      cursor = cursor.subtract(1, 'day')
    }
    
    return count
  }, [progressDates])

  const totalProgress = useMemo(() => {
    // Calcular progresso total como média das porcentagens de cada matéria
    const percentages = MATERIAS.map((materia) => {
      return studyStats.bySubject[materia]?.percentage || 0
    })
    
    if (percentages.length === 0) return 0
    
    const sum = percentages.reduce((acc, pct) => acc + pct, 0)
    return sum / percentages.length
  }, [studyStats])

  const handleStudyToday = async () => {
    if (!user) return
    setSaving(true)
    try {
      const todayKey = dayjs().format('YYYY-MM-DD')
      const now = dayjs()
      const progressDoc = doc(db, 'progress', `${user.uid}_${todayKey}`)
      
      const existing = progressData.find((p) => p.date === todayKey)
      const currentHours = existing?.hours || 0
      const newHours = currentHours + 0.5 // Adiciona 30 minutos
      
      await setDoc(
        progressDoc,
        {
          uid: user.uid,
          date: todayKey,
          hours: newHours,
          lastUpdated: now.format('HH:mm'),
          createdAt: existing?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    } catch (err) {
      console.error('Erro ao salvar progresso:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-lg font-semibold text-alego-600">Carregando dados...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 px-2 sm:px-0">
      <div 
        className="rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm"
        style={{
          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
          color: darkMode ? '#f1f5f9' : '#1e293b'
        }}
      >
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-alego-500 dark:text-alego-400">
          Bem-vindo(a), {profile?.displayName || 'Aluno'}
        </p>
        <h1 className="mt-2 text-xl sm:text-2xl md:text-3xl font-bold text-alego-700 dark:text-alego-300">
          Sua mentoria para a Polícia Legislativa está organizada aqui.
        </h1>
        <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row flex-wrap gap-3">
          <Link
            to="/flashcards"
            className="rounded-full bg-alego-600 px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-semibold text-white text-center"
          >
            Ir para os flashcards
          </Link>
          <button
            type="button"
            onClick={handleStudyToday}
            disabled={saving}
            className="rounded-full border border-alego-600 px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-semibold text-alego-600 disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Marcar estudo de hoje'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        {/* Card Explicativo sobre Memorização Espaçada */}
        <div 
          className="rounded-2xl p-4 sm:p-6 shadow-sm border-2 border-alego-200 dark:border-alego-700 xl:col-span-1"
          style={{
            backgroundColor: darkMode ? '#1e293b' : '#ffffff',
            color: darkMode ? '#f1f5f9' : '#1e293b'
          }}
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="rounded-full bg-alego-100 dark:bg-alego-900 p-2 sm:p-3 flex-shrink-0">
              <LightBulbIcon className="h-5 w-5 sm:h-6 sm:w-6 text-alego-600 dark:text-alego-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-alego-700 dark:text-alego-300 mb-2">
                Como Funciona a Memorização Espaçada (SRS)
              </h3>
              <div className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <p>
                  <strong className="text-alego-600 dark:text-alego-400">🎯 O que é:</strong> Sistema que mostra os cards no momento ideal para revisão, baseado na ciência da memória.
                </p>
                <p>
                  <strong className="text-alego-600 dark:text-alego-400">📈 Como funciona:</strong>
                </p>
                <ul className="ml-3 sm:ml-4 list-disc space-y-1">
                  <li><strong>Fácil:</strong> Card "sobe de nível" - próxima revisão em mais tempo (ex: 7 dias → 14 dias)</li>
                  <li><strong>Difícil:</strong> Card "desce de nível" - próxima revisão em menos tempo (ex: 7 dias → 3 dias)</li>
                </ul>
                <p className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <strong className="text-emerald-600 dark:text-emerald-400">💡 Dica:</strong> Se você não revisar um card por muito tempo, o sistema automaticamente reduz o nível para garantir que você não esqueça!
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-alego-600 to-alego-500 p-4 sm:p-6 text-white">
              <TrophyIcon className="h-6 w-6 sm:h-8 sm:w-8" />
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm uppercase tracking-wide text-alego-100">
                Dias seguidos
              </p>
              <p className="text-2xl sm:text-3xl md:text-4xl font-black">{streak}🔥</p>
            </div>
            <div 
              className="rounded-2xl p-4 sm:p-6 shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                color: darkMode ? '#f1f5f9' : '#1e293b'
              }}
            >
              <BookOpenIcon className="h-6 w-6 sm:h-8 sm:w-8 text-alego-500 dark:text-alego-400" />
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Favoritos
              </p>
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-alego-700 dark:text-alego-300">
                {profile?.favorites?.length || 0}
              </p>
            </div>
            <div 
              className="rounded-2xl p-4 sm:p-6 shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                color: darkMode ? '#f1f5f9' : '#1e293b'
              }}
            >
              <ClockIcon className="h-6 w-6 sm:h-8 sm:w-8 text-alego-500 dark:text-alego-400" />
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Horas estudadas
              </p>
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-alego-700 dark:text-alego-300">
                {studyStats.totalHours.toFixed(1)}h
              </p>
            </div>
            <div 
              className="rounded-2xl p-4 sm:p-6 shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                color: darkMode ? '#f1f5f9' : '#1e293b'
              }}
            >
              <ChartBarIcon className="h-6 w-6 sm:h-8 sm:w-8 text-alego-500 dark:text-alego-400" />
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Progresso total
              </p>
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-alego-700 dark:text-alego-300">
                {totalProgress.toFixed(0)}%
              </p>
            </div>
          </div>
          <ProgressCalendar dates={progressDates} streak={streak} />
        </div>
      </div>

      {/* Seção "Como estudar?" */}
      <div 
        className="rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm border-2 border-alego-200 dark:border-alego-700"
        style={{
          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
          color: darkMode ? '#f1f5f9' : '#1e293b'
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-alego-100 dark:bg-alego-900 p-2">
              <AcademicCapIcon className="h-6 w-6 text-alego-600 dark:text-alego-400" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-alego-700 dark:text-alego-300">
                Como estudar?
              </h2>
              {studyPhase > 1 && (
                <p className="text-xs sm:text-sm text-alego-500 dark:text-alego-400 mt-1">
                  Estudando pela {studyPhase}ª vez
                </p>
              )}
            </div>
          </div>
          {modulesStats.total > 0 && (
            <div className="text-right">
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {modulesStats.daysRemaining > 0 ? (
                  <>
                    <span className="font-semibold text-alego-600 dark:text-alego-400">
                      {modulesStats.daysRemaining} {modulesStats.daysRemaining === 1 ? 'dia' : 'dias'}
                    </span>
                    <br />
                    <span className="text-xs">restantes</span>
                  </>
                ) : (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Todos os módulos completos!
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {suggestedModule ? (
          <div className="space-y-4">
            <div 
              className="rounded-xl p-4 sm:p-6 bg-gradient-to-r from-alego-50 to-alego-100 dark:from-alego-900/50 dark:to-alego-800/50 border border-alego-200 dark:border-alego-700"
            >
              <p className="text-base sm:text-lg text-alego-800 dark:text-alego-200 mb-3">
                Olá! Que tal estudarmos o <strong className="font-bold">{suggestedModule.modulo}</strong> de <strong className="font-bold">{suggestedModule.materia}</strong> hoje?
              </p>
              
              {/* Barra de progresso */}
              {moduleProgress.total > 0 && (
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-alego-700 dark:text-alego-300 font-medium">
                      Progresso: {moduleProgress.studied}/{moduleProgress.total} cards
                    </span>
                    <span className="text-alego-600 dark:text-alego-400 font-semibold">
                      {moduleProgress.percentage}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-alego-200 dark:bg-alego-800">
                    <div
                      className="h-full bg-alego-600 dark:bg-alego-500 transition-all"
                      style={{ width: `${moduleProgress.percentage}%` }}
                    />
                  </div>
                </div>
              )}
              
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to={`/flashcards?materia=${encodeURIComponent(suggestedModule.materia)}&modulo=${encodeURIComponent(suggestedModule.modulo)}`}
                  className="flex-1 rounded-full bg-alego-600 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-alego-700 transition"
                >
                  Ir estudar
                </Link>
                <button
                  type="button"
                  onClick={markModuleAsStudied}
                  disabled={moduleProgress.studied < moduleProgress.total || moduleProgress.total === 0}
                  className="flex items-center justify-center gap-2 rounded-full border-2 border-alego-600 dark:border-alego-500 px-6 py-3 text-sm font-semibold text-alego-600 dark:text-alego-400 hover:bg-alego-50 dark:hover:bg-alego-900 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <CheckCircleIcon className="h-5 w-5" />
                  Estudado
                </button>
              </div>
              {moduleProgress.studied < moduleProgress.total && moduleProgress.total > 0 && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center">
                  Complete todos os {moduleProgress.total} cards para marcar como estudado
                </p>
              )}
            </div>

            {/* Lista de módulos por matéria */}
            <div className="mt-6 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-alego-600 dark:text-alego-400">
                Módulos disponíveis
              </h3>
              <div className="space-y-3">
                {MATERIAS.map((materia) => {
                  const modulos = organizedModules[materia] || []
                  if (modulos.length === 0) return null

                  const isExpanded = expandedMaterias[materia] || false

                  return (
                    <div key={materia} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedMaterias(prev => ({
                            ...prev,
                            [materia]: !prev[materia]
                          }))
                        }}
                        className="flex items-center justify-between w-full text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg p-2 transition"
                      >
                        <h4 className="text-sm font-bold text-alego-700 dark:text-alego-300">
                          {materia} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">({modulos.length} módulos)</span>
                        </h4>
                        <span className="text-xs text-alego-500 dark:text-alego-400">
                          {isExpanded ? '▼ Ocultar' : '▶ Mostrar'}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="flex flex-wrap gap-2 pl-2">
                          {modulos.map((modulo) => {
                            const isStudied = studiedModules[materia]?.[modulo] === true
                            return (
                              <div
                                key={modulo}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                                  isStudied
                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {modulo} {isStudied && '✓'}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-slate-500 dark:text-slate-400">
              Carregando sugestões de estudo...
            </p>
          </div>
        )}
      </div>

      <div 
        className="rounded-2xl p-4 sm:p-6 shadow-sm"
        style={{
          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
          color: darkMode ? '#f1f5f9' : '#1e293b'
        }}
      >
        <h2 className="text-lg sm:text-xl font-bold text-alego-700 dark:text-alego-300">Progresso por Matéria</h2>
        <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
          {MATERIAS.map((materia) => {
            const stats = studyStats.bySubject[materia] || { days: 0, hours: 0, percentage: 0, studiedCards: 0, totalCards: 0 }
            const progress = stats.percentage || 0
            return (
              <div key={materia} className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 text-xs sm:text-sm">
                  <span className="font-semibold text-alego-700 dark:text-alego-300">{materia}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {stats.studiedCards || 0}/{stats.totalCards || 0} cards • {stats.hours.toFixed(1)}h
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className="h-full bg-alego-600 dark:bg-alego-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{progress}% concluído</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
