import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  collection,
  doc,
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
        } else {
          setCardProgress({})
        }
      },
      (error) => {
        console.error('Erro ao carregar progresso dos cards:', error)
        setCardProgress({})
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
