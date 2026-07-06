import { useState } from 'react'
import { ChartBarIcon, ChartPieIcon, ListBulletIcon } from '@heroicons/react/24/outline'
import { useProgressMetrics } from '../hooks/useProgressMetrics'
import SubjectMetricChart from './SubjectMetricChart'

const CHART_TYPES = [
  { id: 'pie', label: 'Pizza', icon: ChartPieIcon },
  { id: 'bar', label: 'Barras', icon: ChartBarIcon },
  { id: 'simple', label: 'Simples', icon: ListBulletIcon },
]

function formatHours(value) {
  if (value < 1) return `${Math.round(value * 60)}min`
  return `${value.toFixed(1)}h`
}

export default function ProgressChartsPanel({ user, courseId }) {
  const [chartType, setChartType] = useState('pie')
  const {
    loading,
    maisEstudadas,
    menosEstudadas,
    questoesAcertosByMateria,
    questoesErrosByMateria,
    flashcardsByMateria,
  } = useProgressMetrics(user, courseId)

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-alego-600 border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Gráficos de Progresso por Matéria
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Alterne entre pizza, barras ou visualização simples
            </p>
          </div>

          <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-600">
            {CHART_TYPES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setChartType(id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  chartType === id
                    ? 'bg-alego-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SubjectMetricChart
            title="Matérias Mais Estudadas"
            data={maisEstudadas}
            chartType={chartType}
            unit="h"
            formatValue={formatHours}
            emptyMessage="Registre horas de estudo para ver esta métrica."
          />
          <SubjectMetricChart
            title="Matérias Menos Estudadas"
            data={menosEstudadas}
            chartType={chartType}
            unit="h"
            formatValue={formatHours}
            emptyMessage="Registre horas de estudo para ver esta métrica."
          />
          <SubjectMetricChart
            title="Questões Resolvidas (Acerto) por Matéria"
            data={questoesAcertosByMateria}
            chartType={chartType}
            unit="q"
            emptyMessage="Resolva questões para ver seus acertos por matéria."
          />
          <SubjectMetricChart
            title="Questões Resolvidas (Erros) por Matéria"
            data={questoesErrosByMateria}
            chartType={chartType}
            unit="q"
            emptyMessage="Resolva questões para ver seus erros por matéria."
          />
          <SubjectMetricChart
            title="Flashcards Estudados por Matéria"
            data={flashcardsByMateria}
            chartType={chartType}
            unit="cards"
            emptyMessage="Estude flashcards para ver o progresso por matéria."
          />
        </div>
      </div>
    </div>
  )
}
