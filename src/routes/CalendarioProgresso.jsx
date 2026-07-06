import { useState, useEffect } from 'react'
import { collection, doc, onSnapshot, query, where, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import ProgressCalendar from '../components/ProgressCalendar'
import EditalProgressChart from '../components/EditalProgressChart'
import ProgressChartsPanel from '../components/ProgressChartsPanel'
import dayjs from 'dayjs'

dayjs.locale('pt-br')

const CalendarioProgresso = () => {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [studyDates, setStudyDates] = useState([])
  const [currentStreak, setCurrentStreak] = useState(0)
  const [studyBySubject, setStudyBySubject] = useState({})

  useEffect(() => {
    if (!user || !profile?.selectedCourseId) {
      setLoading(false)
      return
    }

    const courseId = profile.selectedCourseId
    setLoading(true)

    // Usar a mesma coleção do Dashboard: progress (sem orderBy para evitar índice)
    const progressQuery = query(
      collection(db, 'progress'),
      where('uid', '==', user.uid)
    )

    const unsubscribe = onSnapshot(progressQuery, (querySnapshot) => {
      const progressData = []
      
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.date && (!courseId || data.courseId === courseId)) {
          progressData.push({
            date: data.date,
            hours: data.hours || 0,
            courseId: data.courseId,
            materia: data.materia,
            lastUpdated: data.lastUpdated
          })
        }
      })

      // Ordenar no cliente por data
      progressData.sort((a, b) => b.date.localeCompare(a.date))

      // Extrair datas de estudo (dias com horas > 0)
      const dates = progressData
        .filter(item => item.hours > 0)
        .map(item => item.date)
      
      setStudyDates(dates)
      
      // Calcular streak atual
      const streak = calculateCurrentStreak(dates)
      setCurrentStreak(streak)
      
      // Agrupar por matéria (se disponível)
      const bySubject = {}
      progressData.forEach(item => {
        if (item.hours > 0) {
          const date = item.date // Já está em YYYY-MM-DD
          if (!bySubject[date]) {
            bySubject[date] = { hours: 0, count: 0, materia: null }
          }
          bySubject[date].hours += item.hours
          bySubject[date].count += 1
          // Adicionar matéria se disponível
          if (item.materia) {
            bySubject[date].materia = item.materia
          }
        }
      })
      
      // 🔥 DEBUG: Mostrar dados do bySubject
      // console.log('📅 Calendário - bySubject:', bySubject)
      // console.log('📅 Calendário - studyDates:', studyDates)
      // console.log('📅 Calendário - hoje:', new Date().toISOString().split('T')[0])
      
      setStudyBySubject(bySubject)
      
      setLoading(false)
    }, (error) => {
      console.error('Erro ao carregar dados de estudo:', error)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [user, profile])

  // Calcular streak atual (dias consecutivos de estudo)
  const calculateCurrentStreak = (dates) => {
    if (!dates || dates.length === 0) return 0
    
    const sortedDates = dates
      .map(date => dayjs(date))
      .filter(date => date.isValid())
      .sort((a, b) => b.diff(a))
    
    if (sortedDates.length === 0) return 0
    
    let streak = 0
    const today = dayjs().startOf('day')
    
    // Verificar se estudou hoje
    if (sortedDates[0].isSame(today, 'day')) {
      streak = 1
    } else if (sortedDates[0].isSame(today.subtract(1, 'day'), 'day')) {
      // Se não estudou hoje, mas estudou ontem, streak começa de ontem
      streak = 1
    } else {
      // Se não estudou nos últimos 2 dias, streak é 0
      return 0
    }
    
    // Contar dias consecutivos anteriores
    for (let i = 1; i < sortedDates.length; i++) {
      const expectedDate = sortedDates[i - 1].subtract(1, 'day')
      if (sortedDates[i].isSame(expectedDate, 'day')) {
        streak++
      } else {
        break
      }
    }
    
    return streak
  }

  // Marcar dia como estudado (baseado no Dashboard)
  const handleMarkDay = async (dateStr, materia = null) => {
    if (!user || !profile?.selectedCourseId || saving) return
    
    try {
      setSaving(true)
      const courseKey = profile.selectedCourseId || 'alego'
      const progressDoc = doc(db, 'progress', `${user.uid}_${courseKey}_${dateStr}`)
      
      // Verificar se já existe
      const existing = await getDoc(progressDoc)
      
      if (existing.exists()) {
        // Se já existe, remover (desmarcar)
        await deleteDoc(progressDoc)
      } else {
        // Se não existe, criar com horas mínimas e matéria
        await setDoc(progressDoc, {
          uid: user.uid,
          date: dateStr,
          hours: 0.1, // Mínimo para aparecer no calendário
          courseId: profile.selectedCourseId || null,
          materia: materia, // Adicionar matéria estudada
          lastUpdated: dayjs().format('HH:mm:ss'),
        })
      }
    } catch (error) {
      console.error('Erro ao marcar dia:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Carregando calendário...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Dias Estudados</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {studyDates.length}
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Streak Atual</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {currentStreak} dias
              </p>
            </div>
            <div className="p-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
              <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Taxa de Estudo</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {studyDates.length > 0 ? Math.round((studyDates.length / 28) * 100) : 0}%
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico de Progresso */}
      <div className="mb-8">
        <EditalProgressChart courseId={profile?.selectedCourseId} />
      </div>

      {/* Gráficos de progresso por matéria */}
      <div className="mb-8">
        <ProgressChartsPanel user={user} courseId={profile?.selectedCourseId} />
      </div>

      {/* Calendar */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-4 md:p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1 sm:mb-2">
            Calendário de Estudos
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Clique nos dias para marcar como estudado {saving && '(salvando...)'}
          </p>
        </div>

        <ProgressCalendar
          dates={studyDates}
          streak={currentStreak}
          bySubject={studyBySubject}
          onMarkDay={handleMarkDay}
        />
      </div>

      {/* Instructions */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
          Como usar o Calendário
        </h3>
        <ul className="space-y-2 text-blue-800 dark:text-blue-200">
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Clique em qualquer dia para marcá-lo como estudado</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Dias marcados em verde indicam que você estudou</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Clique novamente para desmarcar um dia</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>O calendário mostra os últimos 28 dias de estudo</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default CalendarioProgresso
