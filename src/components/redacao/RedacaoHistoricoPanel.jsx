import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from 'recharts'
import {
  ChartBarIcon,
  DocumentTextIcon,
  ArrowLeftIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import {
  listStudentRedacoes,
  getRedacaoSummary,
} from '../../services/redacaoStudentService'

const CRIT_KEYS = [
  { key: 'dominio', label: 'Domínio' },
  { key: 'compreensao', label: 'Compreensão' },
  { key: 'argumentacao', label: 'Argumentação' },
  { key: 'estrutura', label: 'Estrutura' },
  { key: 'conhecimento', label: 'Conhecimento' },
]

export default function RedacaoHistoricoPanel({ userId, courseId, refreshKey = 0, onBack }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!userId || !courseId) {
        setItems([])
        setSummary(null)
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const [list, sum] = await Promise.all([
          listStudentRedacoes(userId, courseId, { max: 40 }),
          getRedacaoSummary(userId, courseId),
        ])
        if (cancelled) return
        setItems(list)
        setSummary(sum)
        if (list[0] && !selectedId) setSelectedId(list[0].id)
      } catch (err) {
        console.error('[redacao historico]', err)
        if (!cancelled) {
          setItems([])
          setSummary(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId, courseId, refreshKey])

  const selected = items.find((i) => i.id === selectedId) || null

  const evolutionData = useMemo(() => {
    const chronological = [...items].sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0))
    return chronological.map((r, idx) => ({
      idx: idx + 1,
      label: r.createdAtMs
        ? dayjs(r.createdAtMs).format('DD/MM')
        : `#${idx + 1}`,
      nota: Number(r.nota) || 0,
      tema: String(r.tema || '').slice(0, 40),
    }))
  }, [items])

  const radarData = useMemo(() => {
    if (!items.length) return []
    const avg = {}
    CRIT_KEYS.forEach(({ key }) => {
      const vals = items
        .map((r) => Number(r.criterios?.[key]))
        .filter((n) => Number.isFinite(n))
      avg[key] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    })
    const last = items[0]?.criterios || {}
    return CRIT_KEYS.map(({ key, label }) => ({
      criterio: label,
      media: avg[key],
      ultima: Number(last[key]) || 0,
    }))
  }, [items])

  const improvement = useMemo(() => {
    if (evolutionData.length < 2) return null
    const first = evolutionData[0].nota
    const last = evolutionData[evolutionData.length - 1].nota
    return last - first
  }, [evolutionData])

  if (loading) {
    return <p className="py-12 text-center text-sm text-cp-muted">Carregando histórico…</p>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="cp-badge cp-badge-cyan">Histórico</span>
          <h1 className="cp-headline mt-3 text-2xl">Suas redações</h1>
          <p className="mt-1 text-sm text-cp-muted">
            Consulte notas, evolução e a redação nota 1000 de cada treino.
          </p>
        </div>
        {onBack ? (
          <button type="button" onClick={onBack} className="cp-btn-ghost !text-xs">
            <ArrowLeftIcon className="h-4 w-4" />
            Voltar ao treino
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="cp-card p-4">
          <p className="font-mono text-[10px] uppercase text-cp-muted">Total</p>
          <p className="mt-1 text-2xl font-semibold text-cp-text">{summary?.total ?? items.length}</p>
        </div>
        <div className="cp-card p-4">
          <p className="font-mono text-[10px] uppercase text-cp-muted">Média</p>
          <p className="mt-1 text-2xl font-semibold text-cp-accent">{summary?.averageNota ?? '—'}</p>
        </div>
        <div className="cp-card p-4">
          <p className="font-mono text-[10px] uppercase text-cp-muted">Melhor</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{summary?.bestNota ?? '—'}</p>
        </div>
        <div className="cp-card p-4">
          <p className="font-mono text-[10px] uppercase text-cp-muted">Evolução</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              improvement == null
                ? 'text-cp-muted'
                : improvement >= 0
                  ? 'text-emerald-600'
                  : 'text-rose-500'
            }`}
          >
            {improvement == null ? '—' : `${improvement >= 0 ? '+' : ''}${improvement}`}
          </p>
        </div>
      </div>

      {evolutionData.length > 0 ? (
        <div className="cp-card p-4 sm:p-5">
          <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-cp-accent">
            <ChartBarIcon className="h-4 w-4" />
            Mapa de evolução da nota
          </p>
          <div className="h-52 w-full min-w-0 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolutionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 1000]} width={36} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--cp-bg-elevated)',
                    border: '1px solid var(--cp-border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${value}`, 'Nota']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.tema || 'Redação'}
                />
                <Line
                  type="monotone"
                  dataKey="nota"
                  stroke="var(--cp-accent)"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: 'var(--cp-accent-2)' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {radarData.length > 0 ? (
        <div className="cp-card p-4 sm:p-5">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-cp-muted">
            Competências — média vs última
          </p>
          <div className="h-72 w-full min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="criterio" tick={{ fontSize: 9 }} />
                <PolarRadiusAxis domain={[0, 200]} tick={{ fontSize: 9 }} />
                <Radar
                  name="Média"
                  dataKey="media"
                  stroke="var(--cp-accent)"
                  fill="var(--cp-accent)"
                  fillOpacity={0.25}
                />
                <Radar
                  name="Última"
                  dataKey="ultima"
                  stroke="var(--cp-accent-2)"
                  fill="var(--cp-accent-2)"
                  fillOpacity={0.2}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="cp-card py-12 text-center text-sm text-cp-muted">
          Ainda não há redações salvas. Finalize um treino para começar o histórico.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <div className="max-h-[40vh] space-y-2 overflow-y-auto lg:max-h-[70vh]">
            {items.map((item) => {
              const when = item.createdAtMs
                ? dayjs(item.createdAtMs).format('DD/MM/YYYY HH:mm')
                : ''
              const active = item.id === selectedId
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`min-h-12 w-full rounded-xl border p-3 text-left transition ${
                    active
                      ? 'border-cp-accent/40 bg-cp-accent/10'
                      : 'border-cp-border bg-cp-surface hover:border-cp-accent/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-lg font-semibold text-cp-accent">{item.nota}</p>
                    <span className="font-mono text-[10px] text-cp-muted">{when}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-cp-text">{item.tema || 'Sem tema'}</p>
                </button>
              )
            })}
          </div>

          {selected ? (
            <div className="space-y-4">
              <div className="cp-card p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">Tema</p>
                <h2 className="mt-1 text-base font-medium text-cp-text">{selected.tema}</h2>
                <p className="mt-3 text-3xl font-black text-cp-accent">{selected.nota}<span className="text-base font-normal text-cp-muted">/1000</span></p>
                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
                  {CRIT_KEYS.map(({ key, label }) => (
                    <div key={key} className="rounded-lg border border-cp-border bg-cp-bg/40 p-2 text-center">
                      <p className="truncate font-mono text-[9px] uppercase text-cp-muted">{label}</p>
                      <p className="text-sm font-semibold text-cp-text">{selected.criterios?.[key] ?? '—'}</p>
                    </div>
                  ))}
                </div>
                {selected.feedback ? (
                  <p className="mt-4 text-sm leading-relaxed text-cp-muted whitespace-pre-wrap">{selected.feedback}</p>
                ) : null}
              </div>

              {selected.texto ? (
                <div className="cp-card p-5">
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-cp-muted">Sua redação</p>
                  <div className="max-h-64 overflow-y-auto rounded-xl border border-cp-border bg-cp-bg/40 p-4">
                    <p className="whitespace-pre-wrap text-sm text-cp-text">{selected.texto}</p>
                  </div>
                </div>
              ) : null}

              <div className="cp-card border-amber-500/30 p-5">
                <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-amber-600">
                  <DocumentTextIcon className="h-4 w-4" />
                  Redação nota 1000
                </p>
                <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-cp-border bg-cp-bg/40 p-4">
                  <p className="whitespace-pre-wrap break-words font-serif text-sm leading-relaxed text-cp-text">
                    {selected.redacaoModelo || 'Modelo não disponível nesta entrada.'}
                  </p>
                </div>
              </div>

              {Array.isArray(selected.dicas) && selected.dicas.length > 0 ? (
                <div className="cp-card p-5">
                  <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase text-emerald-600">
                    <SparklesIcon className="h-4 w-4" />
                    Dicas
                  </p>
                  <ul className="space-y-1.5">
                    {selected.dicas.map((d, i) => (
                      <li key={i} className="text-sm text-cp-text">• {d}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
