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
      <div className="cp-card flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <section className="cp-card p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="cp-badge cp-badge-accent">Progresso</span>
          <h2 className="cp-headline mt-3 text-xl sm:text-2xl">
            Gráficos por Matéria
          </h2>
          <p className="mt-1 text-sm text-cp-muted">
            Alterne entre pizza, barras ou visualização simples
          </p>
        </div>

        <div className="flex rounded-lg border border-cp-border bg-cp-surface p-1">
          {CHART_TYPES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setChartType(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                chartType === id
                  ? 'bg-cp-accent text-white shadow-cp-glow'
                  : 'text-cp-muted hover:bg-cp-surface hover:text-cp-text'
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
    </section>
  )
}
