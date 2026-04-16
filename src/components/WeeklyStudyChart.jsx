import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CalendarIcon, BookOpenIcon } from '@heroicons/react/24/outline'
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import dayjs from 'dayjs'

// Configurar locale para português
dayjs.locale('pt-br')

const WeeklyStudyChart = ({ courseId }) => {
  const { user, profile } = useAuth()
  const [weekData, setWeekData] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalDays: 0,
    studiedDays: 0,
    totalMaterias: 0
  })

  // Cores para o gráfico
  const COLORS = {
    estudadas: '#10B981', // verde
    naoEstudadas: '#EF4444' // vermelho
  }

  useEffect(() => {
    loadWeeklyData()
  }, [courseId, user])

  const loadWeeklyData = async () => {
    if (!user || !courseId) return

    setLoading(true)
    try {
      // Buscar dados de progresso do edital verticalizado
      const userProgressRef = doc(db, 'userEditalProgress', user.uid, 'courses', courseId)
      const userProgressSnap = await getDoc(userProgressRef)
      
      let userProgressData = {}
      if (userProgressSnap.exists()) {
        userProgressData = userProgressSnap.data().progress || {}
      }
      
      // Buscar dados de progresso diário (para datas)
      const progressQuery = query(
        collection(db, 'progress'),
        where('uid', '==', user.uid),
        where('courseId', '==', courseId),
        orderBy('date', 'desc')
      )

      const querySnapshot = await getDocs(progressQuery)
      const dailyProgressData = []
      
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.date && data.materia) {
          dailyProgressData.push({
            date: data.date,
            disciplina: data.materia, // Usar materia como disciplina
            topico: data.materia, // Para compatibilidade
            estudado: (data.hours || 0) > 0 // Considerar estudado se tiver horas
          })
        }
      })

      // DEBUG: Mostrar dados encontrados
      console.log('WeeklyStudyChart - Dados diários encontrados:', dailyProgressData)

      // Criar array com os dias da semana (Segunda a Domingo)
      const today = dayjs()
      const weekStart = today.startOf('week').day(1) // Segunda-feira
      
      const weekDays = []
      for (let i = 0; i < 7; i++) {
        const date = weekStart.add(i, 'day')
        const dateStr = date.format('YYYY-MM-DD')
        
        // Encontrar dados para este dia
        const dayTopics = dailyProgressData.filter(item => item.date === dateStr && item.estudado)
        
        // Extrair matérias únicas do dia
        const materiasDoDia = [...new Set(dayTopics.map(item => item.disciplina).filter(Boolean))]
        
        weekDays.push({
          date: dateStr,
          dayName: date.format('ddd'),
          dayNumber: date.format('D'),
          dayFull: date.format('dddd'),
          materias: materiasDoDia,
          estudado: dayTopics.length > 0,
          topicosEstudados: dayTopics.length
        })
      }

      // DEBUG: Mostrar dados da semana processados
      console.log('WeeklyStudyChart - Dados da semana:', weekDays)

      // Preparar dados para o gráfico
      const chartData = weekDays.map(day => ({
        name: day.dayName,
        dia: day.dayNumber,
        materiasEstudadas: day.materias.length,
        estudado: day.estudado ? 1 : 0,
        naoEstudado: day.estudado ? 0 : 1,
        materias: day.materias,
        fullDay: day.dayFull
      }))

      // Calcular estatísticas
      const totalDays = weekDays.length
      const studiedDays = weekDays.filter(day => day.estudado).length
      const totalMaterias = weekDays.reduce((acc, day) => acc + day.materias.length, 0)
      const totalTopicos = weekDays.reduce((acc, day) => acc + (day.topicosEstudados || 0), 0)

      setStats({
        totalDays,
        studiedDays,
        totalMaterias,
        totalTopicos
      })

      setWeekData(chartData)
    } catch (error) {
      console.error('Erro ao carregar dados semanais:', error)
    } finally {
      setLoading(false)
    }
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-900 dark:text-white mb-1">
            {data.fullDay} ({data.dia})
          </p>
          {data.materias.length > 0 ? (
            <div>
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                Matérias estudadas:
              </p>
              {data.materias.map((materia, index) => (
                <p key={index} className="text-xs text-slate-600 dark:text-slate-400 ml-2">
                  • {materia}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-red-600 dark:text-red-400">
              Nenhuma matéria estudada
            </p>
          )}
        </div>
      )
    }
    return null
  }

  const CustomLabel = ({ x, y, width, height, value }) => {
    if (value === 0) return null
    
    return (
      <text 
        x={x + width / 2} 
        y={y - 5} 
        fill="#666" 
        textAnchor="middle" 
        className="text-xs font-semibold"
      >
        {value}
      </text>
    )
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <CalendarIcon className="h-6 w-6 text-alego-600" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Estudos Semanais
          </h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Matérias estudadas por dia (Segunda a Domingo)
        </p>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalDays}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Dias na semana</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.studiedDays}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Dias estudados</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalMaterias}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Matérias</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.totalTopicos || 0}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Tópicos</p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={weekData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar 
              dataKey="materiasEstudadas" 
              name="Matérias Estudadas"
              fill={COLORS.estudadas}
              label={<CustomLabel />}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Resumo dos dias */}
      <div className="mt-6 grid grid-cols-7 gap-2">
        {weekData.map((day, index) => (
          <div 
            key={index}
            className={`text-center p-2 rounded-lg border ${
              day.materiasEstudadas > 0 
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            }`}
          >
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {day.name}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {day.dia}
            </p>
            <p className={`text-xs font-bold ${
              day.materiasEstudadas > 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            }`}>
              {day.materiasEstudadas}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default WeeklyStudyChart
