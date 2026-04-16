import React, { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { BookOpenIcon, CheckCircleIcon, XCircleIcon, ChartPieIcon } from '@heroicons/react/24/outline'
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'

const EditalProgressChart = ({ courseId }) => {
  const { user, profile } = useAuth()
  const [progressData, setProgressData] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    estudadas: 0,
    naoEstudadas: 0,
    porcentagemEstudada: 0,
    porcentagemRestante: 0
  })

  // Cores para o gráfico
  const COLORS = {
    estudadas: '#10B981', // verde
    naoEstudadas: '#EF4444', // vermelho
    parcialmente: '#F59E0B' // amarelo
  }

  useEffect(() => {
    loadEditalProgress()
  }, [courseId, user])

  const loadEditalProgress = async () => {
    if (!user || !courseId) return

    setLoading(true)
    try {
      // Buscar edital verticalizado para obter a estrutura
      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      const editalSnap = await getDoc(editalRef)
      
      if (!editalSnap.exists()) {
        console.log('Edital não encontrado')
        setLoading(false)
        return
      }

      const editalData = editalSnap.data()
      const disciplinas = editalData.disciplinas || []
      
      // Buscar progresso do usuário
      const userProgressRef = doc(db, 'userEditalProgress', user.uid, 'courses', courseId)
      const userProgressSnap = await getDoc(userProgressRef)
      
      let userProgressData = {}
      if (userProgressSnap.exists()) {
        userProgressData = userProgressSnap.data().progress || {}
      }
      
      console.log('Dados de progresso do usuário:', userProgressData)
      
      // Calcular progresso por disciplina
      let totalTopicos = 0
      let topicosEstudados = 0
      let topicosNaoEstudados = 0

      // Função para gerar chave do tópico (igual à usada no EditalVerticalizado)
      const makeTopicKey = (topico) => {
        if (!topico) return ''
        const numero = (topico.numero || '').toString().trim()
        const nome = (topico.nome || '').toString().trim()

        // Mantém compatibilidade com dados antigos: se só tiver um dos dois, usa ele.
        if (!numero && !nome) return ''
        if (!numero || !nome) {
          const base = numero || nome
          return encodeURIComponent(base)
        }

        // Nova forma: "numero :: nome" (separador pouco provável de aparecer no texto)
        const combined = `${numero} :: ${nome}`
        return encodeURIComponent(combined)
      }

      disciplinas.forEach(disciplina => {
        if (disciplina.topicos) {
          disciplina.topicos.forEach(topico => {
            totalTopicos++
            
            // Usar exatamente a mesma função makeTopicKey
            const topicKey = makeTopicKey(topico)
            
            // Verificar progresso do usuário para este tópico
            const topicoProgress = userProgressData[topicKey] || {}
            const estudadoMarcado = topicoProgress.estudado || false
            
            console.log(`Tópico: ${topicKey}, Estudado: ${estudadoMarcado}`)
            
            if (estudadoMarcado) {
              topicosEstudados++
            } else {
              topicosNaoEstudados++
            }
          })
        }
      })

      // Preparar dados para o gráfico
      const chartData = []
      if (topicosEstudados > 0) {
        chartData.push({
          name: 'Estudadas',
          value: topicosEstudados,
          color: COLORS.estudadas
        })
      }
      if (topicosNaoEstudados > 0) {
        chartData.push({
          name: 'Não estudadas',
          value: topicosNaoEstudados,
          color: COLORS.naoEstudadas
        })
      }

      // Calcular estatísticas
      const porcentagemEstudada = totalTopicos > 0 ? Math.round((topicosEstudados / totalTopicos) * 100) : 0
      const porcentagemRestante = 100 - porcentagemEstudada

      setStats({
        total: totalTopicos,
        estudadas: topicosEstudados,
        naoEstudadas: topicosNaoEstudados,
        parcialmente: 0,
        porcentagemEstudada,
        porcentagemRestante,
        topicosComProgresso: topicosEstudados
      })

      setProgressData(chartData)
    } catch (error) {
      console.error('Erro ao carregar progresso do edital:', error)
    } finally {
      setLoading(false)
    }
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-900 dark:text-white">{data.name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {data.value} tópicos ({Math.round((data.value / stats.total) * 100)}%)
          </p>
        </div>
      )
    }
    return null
  }

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null // Não mostrar label se for muito pequeno
    
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        className="text-xs font-semibold"
      >
        {`${(percent * 100).toFixed(0)}%`}
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

  if (progressData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="text-center">
          <ChartPieIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">
            Nenhum dado de progresso encontrado
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <BookOpenIcon className="h-6 w-6 text-alego-600" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Progresso do Edital
          </h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Andamento dos tópicos do edital verticalizado
        </p>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Total</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.estudadas}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Estudadas</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.parcialmente}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Parciais</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.naoEstudadas}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Não estudadas</p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="h-[32rem]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={progressData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={CustomLabel}
              outerRadius={180}
              fill="#8884d8"
              dataKey="value"
            >
              {progressData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              formatter={(value, entry) => {
                // entry contém o objeto completo com name, value, etc.
                return `${entry.payload.name}: ${entry.payload.value}`
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Barra de Progresso */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Progresso Geral
          </span>
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            {stats.porcentagemEstudada}%
          </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
          <div 
            className="bg-green-600 dark:bg-green-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${stats.porcentagemEstudada}%` }}
          ></div>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          {stats.total - stats.topicosComProgresso} tópicos sem progresso
        </p>
      </div>
    </div>
  )
}

export default EditalProgressChart
