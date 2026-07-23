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
      
      // Agrupar por data — acumula TODAS as matérias do dia (X e Y)
      const bySubject = {}
      progressData.forEach(item => {
        if (item.hours > 0) {
          const date = item.date // Já está em YYYY-MM-DD
          if (!bySubject[date]) {
            bySubject[date] = { hours: 0, count: 0, materia: null, materias: [] }
          }
          bySubject[date].hours += item.hours
          bySubject[date].count += 1
          const names = new Set(bySubject[date].materias || [])
          if (Array.isArray(item.materias)) item.materias.filter(Boolean).forEach((m) => names.add(m))
          if (item.materia) names.add(item.materia)
          bySubject[date].materias = [...names]
          bySubject[date].materia = bySubject[date].materias.join(', ') || item.materia || null
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
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
          <p className="mt-4 text-sm text-cp-muted">Carregando calendário…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-6">
      <ProgressChartsPanel
        user={user}
        courseId={profile?.selectedCourseId || 'alego-default'}
      />

      <div className="dash-rail !grid-cols-3">
        <div className="dash-rail-item dash-tile--cyan !min-h-0 !cursor-default !py-3 hover:!transform-none hover:!shadow-none">
          <p className="font-mono text-[9px] uppercase tracking-wider text-cp-muted">Dias</p>
          <p className="text-lg font-semibold text-cp-text">{studyDates.length}</p>
        </div>
        <div className="dash-rail-item dash-tile--amber !min-h-0 !cursor-default !py-3 hover:!transform-none hover:!shadow-none">
          <p className="font-mono text-[9px] uppercase tracking-wider text-cp-muted">Streak</p>
          <p className="text-lg font-semibold text-cp-text">{currentStreak}d</p>
        </div>
        <div className="dash-rail-item dash-tile--success !min-h-0 !cursor-default !py-3 hover:!transform-none hover:!shadow-none">
          <p className="font-mono text-[9px] uppercase tracking-wider text-cp-muted">Taxa</p>
          <p className="text-lg font-semibold text-cp-text">
            {studyDates.length > 0 ? Math.round((studyDates.length / 28) * 100) : 0}%
          </p>
        </div>
      </div>

      <EditalProgressChart courseId={profile?.selectedCourseId} />

      <div className="cp-card p-3 sm:p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-cp-text sm:text-lg">Calendário</h2>
          <p className="mt-1 text-xs text-cp-muted">
            Toque no dia para marcar estudo {saving ? '(salvando…)' : ''}
          </p>
        </div>

        <ProgressCalendar
          dates={studyDates}
          streak={currentStreak}
          bySubject={studyBySubject}
          onMarkDay={handleMarkDay}
        />
      </div>
    </div>
  )
}

export default CalendarioProgresso
