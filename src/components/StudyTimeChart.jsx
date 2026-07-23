import React, { useState, useEffect, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { ClockIcon, ChartPieIcon } from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { assignSubjectTopicColors } from '../utils/progressChartColors'

function getStartDate(filter) {
  switch (filter) {
    case 'day':
      return dayjs().startOf('day').toDate()
    case 'week':
      return dayjs().subtract(7, 'day').startOf('day').toDate()
    case 'month':
      return dayjs().subtract(1, 'month').startOf('day').toDate()
    default:
      return new Date(0)
  }
}

function rowDate(row) {
  const ts = row.createdAt
  if (!ts) return null
  if (ts.toDate) return ts.toDate()
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function rowMinutes(row) {
  return row.durationMinutes || row.minutos || 0
}

async function loadTrilhaRows(userId) {
  if (!userId || !db) return { sessions: [], manual: [] }

  const sessions = []
  const manual = []

  try {
    const sessSnap = await getDocs(collection(db, 'users', userId, 'trilhaSessions'))
    sessSnap.docs.forEach((d) => sessions.push({ id: d.id, kind: 'session', ...d.data() }))
  } catch {
    /* fallback below */
  }

  try {
    const manSnap = await getDocs(collection(db, 'users', userId, 'trilhaManualEntries'))
    manSnap.docs.forEach((d) => manual.push({ id: d.id, kind: 'manual', ...d.data() }))
  } catch {
    /* ignore */
  }

  if (sessions.length === 0 && manual.length === 0) {
    try {
      const { query, where, getDocs: gd } = await import('firebase/firestore')
      const snap = await gd(query(collection(db, 'progress'), where('uid', '==', userId)))
      snap.docs.forEach((d) => {
        const data = d.data()
        if (data.type === 'trilha_session') sessions.push({ id: d.id, kind: 'session', ...data })
        if (data.type === 'trilha_manual') manual.push({ id: d.id, kind: 'manual', ...data })
      })
    } catch {
      /* ignore */
    }
  }

  return { sessions, manual }
}

const StudyTimeChart = ({ userId, courseId = null }) => {
  const [studyData, setStudyData] = useState([])
  const [filter, setFilter] = useState('total')
  const [loading, setLoading] = useState(true)
  const [totalHours, setTotalHours] = useState(0)

  const loadStudyData = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    try {
      const startDate = getStartDate(filter)
      const { sessions, manual } = await loadTrilhaRows(userId)
      const rows = [...sessions, ...manual].filter((row) => {
        const date = rowDate(row)
        if (!date || date < startDate) return false
        if (courseId && row.courseId && row.courseId !== courseId) return false
        const mins = rowMinutes(row)
        return mins > 0 && row.materia?.trim()
      })

      const bucket = {}
      let total = 0

      rows.forEach((row) => {
        const materia = row.materia.trim()
        const assunto = String(row.assunto || '').trim()
        const key = assunto ? `${materia}|||${assunto}` : `materia|||${materia}`
        const hours = rowMinutes(row) / 60
        if (!bucket[key]) {
          bucket[key] = { materia, assunto, hours: 0 }
        }
        bucket[key].hours += hours
        total += hours
      })

      const chartData = assignSubjectTopicColors(
        Object.values(bucket)
          .map((item) => ({
            name: item.assunto ? `${item.materia} · ${item.assunto}` : item.materia,
            materia: item.materia,
            assunto: item.assunto || '',
            isTopic: Boolean(item.assunto),
            value: parseFloat(item.hours.toFixed(2)),
            percentage: total > 0 ? ((item.hours / total) * 100).toFixed(1) : 0,
          }))
          .sort((a, b) => b.value - a.value)
      )

      setStudyData(chartData)
      setTotalHours(total)
    } catch (error) {
      console.error('Erro ao carregar dados de estudo:', error)
      setStudyData([])
      setTotalHours(0)
    } finally {
      setLoading(false)
    }
  }, [filter, userId, courseId])

  useEffect(() => {
    loadStudyData()
  }, [loadStudyData])

  const formatHours = (hours) => {
    if (hours < 1) return `${Math.round(hours * 60)}min`
    return `${hours.toFixed(1)}h`
  }

  const getFilterLabel = () => {
    switch (filter) {
      case 'day': return 'Hoje'
      case 'week': return 'Última Semana'
      case 'month': return 'Último Mês'
      default: return 'Total'
    }
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload[0]) {
      return (
        <div className="rounded-lg border border-cp-border bg-cp-bg-elevated p-3 shadow-lg">
          <p className="font-semibold text-cp-text">{payload[0].name}</p>
          <p className="text-sm text-cp-muted">
            {formatHours(payload[0].value)} ({payload[0].payload.percentage}%)
          </p>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="cp-card p-6">
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-1/4 rounded bg-cp-surface" />
          <div className="h-64 rounded bg-cp-surface" />
        </div>
      </div>
    )
  }

  return (
    <div className="cp-card p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-cp-accent/10 p-2">
            <ChartPieIcon className="h-6 w-6 text-cp-accent" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-cp-text">Tempo de Estudo por Matéria e Tópico</h3>
            <p className="text-sm text-cp-muted">
              {getFilterLabel()}: {formatHours(totalHours)}
              {studyData.length > 0 && (
                <> · {[...new Set(studyData.map((d) => d.materia).filter(Boolean))].join(', ')}</>
              )}
            </p>
          </div>
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-cp-border bg-cp-surface px-3 py-2 text-sm text-cp-text"
        >
          <option value="day">Hoje</option>
          <option value="week">Última Semana</option>
          <option value="month">Último Mês</option>
          <option value="total">Total</option>
        </select>
      </div>

      {studyData.length === 0 ? (
        <div className="py-12 text-center">
          <ClockIcon className="mx-auto mb-4 h-12 w-12 text-cp-muted" />
          <p className="text-cp-muted">Nenhum bloco salvo na Trilha neste período.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                  dataKey="value"
                >
                  {studyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3">
            <h4 className="mb-4 font-semibold text-cp-text">Detalhes (matéria · tópico)</h4>
            {studyData.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-lg bg-cp-surface p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-cp-text">{item.name}</span>
                    {item.assunto && (
                      <span className="block truncate text-[11px] text-cp-muted">{item.materia}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-cp-text">{formatHours(item.value)}</p>
                  <p className="text-sm text-cp-muted">{item.percentage}%</p>
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
