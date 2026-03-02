import React, { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { ClockIcon, CalendarIcon, ArrowPathIcon, ChartPieIcon } from '@heroicons/react/24/outline'

const StudyTimeChart = ({ userId }) => {
  const [studyData, setStudyData] = useState([])
  const [filter, setFilter] = useState('total') // 'day', 'week', 'month', 'total'
  const [loading, setLoading] = useState(true)
  const [totalHours, setTotalHours] = useState(0)

  // Cores para o gráfico
  const COLORS = [
    '#3B82F6', // azul
    '#10B981', // verde
    '#F59E0B', // amarelo
    '#EF4444', // vermelho
    '#8B5CF6', // roxo
    '#EC4899', // rosa
    '#14B8A6', // teal
    '#F97316', // laranja
    '#6366F1', // indigo
    '#84CC16', // lime
  ]

  useEffect(() => {
    loadStudyData()
  }, [filter, userId])

  const loadStudyData = async () => {
    if (!userId) return

    setLoading(true)
    try {
      // Calcular período baseado no filtro
      const now = new Date()
      let startDate = new Date()

      switch (filter) {
        case 'day':
          startDate.setHours(0, 0, 0, 0)
          break
        case 'week':
          startDate.setDate(now.getDate() - 7)
          break
        case 'month':
          startDate.setMonth(now.getMonth() - 1)
          break
        case 'total':
          startDate = new Date(0) // Início dos tempos
          break
      }

      // Buscar sessões de estudo do Firebase
      const { collection, query, where, getDocs, orderBy, limit } = await import('firebase/firestore')
      const { db } = await import('../firebase/config')

      const studySessionsRef = collection(db, 'users', userId, 'studySessions')
      const q = query(
        studySessionsRef,
        where('startTime', '>=', startDate),
        orderBy('startTime', 'desc'),
        limit(1000)
      )

      const querySnapshot = await getDocs(q)
      const sessions = []

      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.endTime && data.startTime) {
          const duration = (data.endTime.toDate() - data.startTime.toDate()) / 1000 / 60 / 60 // horas
          sessions.push({
            id: doc.id,
            materia: data.materia || 'Não categorizado',
            duration: duration,
            date: data.startTime.toDate()
          })
        }
      })

      // Agrupar por matéria
      const materiaData = {}
      let total = 0

      sessions.forEach(session => {
        if (!materiaData[session.materia]) {
          materiaData[session.materia] = 0
        }
        materiaData[session.materia] += session.duration
        total += session.duration
      })

      // Converter para formato do gráfico
      const chartData = Object.entries(materiaData).map(([materia, hours]) => ({
        name: materia,
        value: parseFloat(hours.toFixed(2)),
        percentage: total > 0 ? ((hours / total) * 100).toFixed(1) : 0
      })).sort((a, b) => b.value - a.value)

      setStudyData(chartData)
      setTotalHours(total)
    } catch (error) {
      console.error('Erro ao carregar dados de estudo:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetData = async () => {
    if (!userId || !confirm('Tem certeza que deseja resetar todos os dados de estudo? Esta ação não pode ser desfeita.')) {
      return
    }

    try {
      const { collection, query, where, getDocs, deleteDoc, doc } = await import('firebase/firestore')
      const { db } = await import('../firebase/config')

      const studySessionsRef = collection(db, 'users', userId, 'studySessions')
      const q = query(studySessionsRef, where('userId', '==', userId))
      const querySnapshot = await getDocs(q)

      const batch = querySnapshot.docs.map(doc => deleteDoc(doc.ref))
      await Promise.all(batch)

      setStudyData([])
      setTotalHours(0)
      alert('Dados de estudo resetados com sucesso!')
    } catch (error) {
      console.error('Erro ao resetar dados:', error)
      alert('Erro ao resetar dados. Tente novamente.')
    }
  }

  const formatHours = (hours) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}min`
    }
    return `${hours.toFixed(1)}h`
  }

  const getFilterLabel = () => {
    switch (filter) {
      case 'day': return 'Hoje'
      case 'week': return 'Última Semana'
      case 'month': return 'Último Mês'
      case 'total': return 'Total'
      default: return 'Total'
    }
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload[0]) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-900 dark:text-white">{payload[0].name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {formatHours(payload[0].value)} ({payload[0].payload.percentage}%)
          </p>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
            <ChartPieIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Tempo de Estudo por Matéria
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {getFilterLabel()}: {formatHours(totalHours)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filtros */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
          >
            <option value="day">Hoje</option>
            <option value="week">Última Semana</option>
            <option value="month">Último Mês</option>
            <option value="total">Total</option>
          </select>

          {/* Botão Reset */}
          <button
            onClick={resetData}
            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="Resetar dados"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      {studyData.length === 0 ? (
        <div className="text-center py-12">
          <ClockIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">
            Nenhum dado de estudo encontrado para este período.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
            Comece a estudar para ver suas estatísticas!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico */}
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={studyData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ percentage }) => `${percentage}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {studyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Lista de Matérias */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Detalhes por Matéria</h4>
            {studyData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="font-medium text-slate-900 dark:text-white">{item.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {formatHours(item.value)}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {item.percentage}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default StudyTimeChart
