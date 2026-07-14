import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BoltIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { useResolverIncidencia } from '../hooks/useResolverIncidencia'
import TechHubHeader from '../components/cp/TechHubHeader'

const ResolverIncidenciaView = () => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || 'alego-default'
  const { materias, totalMaterias, loading, hasEdital } = useResolverIncidencia(
    courseId,
    user,
    profile,
  )

  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return materias
    return materias.filter((m) => m.nome.toLowerCase().includes(q))
  }, [materias, search])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
          <p className="mt-4 font-mono text-sm text-cp-muted">Carregando incidências…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative space-y-6 pb-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-50"
        style={{
          backgroundImage:
            'linear-gradient(var(--cp-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--cp-grid-line) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 20%, transparent 75%)',
        }}
      />

      <TechHubHeader
        badge="Incidência"
        code="04"
        title="Estudar por incidência"
        description={`${totalMaterias} matéria(s) com revisão e prática por incidência`}
        icon={BoltIcon}
        tone="red"
      />

      {totalMaterias === 0 && (
        <div className="cp-tech-card p-8 text-center">
          <p className="font-display font-semibold text-cp-text">Nenhuma incidência liberada ainda</p>
          <p className="mt-2 text-sm text-cp-muted">
            {hasEdital
              ? 'O administrador precisa gerar e liberar a incidência das matérias no Edital Verticalizado.'
              : 'Configure o edital verticalizado para estudar por incidência.'}
          </p>
          <Link to="/edital-verticalizado" className="cp-btn-primary mt-6 inline-flex">
            Ir ao Edital Verticalizado
          </Link>
        </div>
      )}

      {totalMaterias > 0 && (
        <div className="mx-auto w-full max-w-2xl">
          <div className="cp-tech-panel">
            <div className="border-b border-cp-border p-4">
              <p className="font-display text-sm font-semibold tracking-tight text-cp-text">
                Matérias por incidência
              </p>
              <p className="mb-3 font-mono text-[11px] text-cp-muted">
                Escolha uma matéria para estudar conteúdo e prática
              </p>
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cp-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar matéria..."
                  className="w-full rounded-xl border border-cp-border bg-cp-bg/60 py-2.5 pl-9 pr-3 font-mono text-sm text-cp-text placeholder:text-cp-muted focus:border-cp-accent/50 focus:outline-none focus:ring-2 focus:ring-cp-accent/20"
                />
              </div>
            </div>

            <div className="divide-y divide-cp-border/50">
              {filtered.map((materia) => {
                const hue = [...materia.nome].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
                return (
                  <Link
                    key={materia.key}
                    to={`/conteudo-incidencia/${courseId}/${materia.idx}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-cp-surface/60"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
                      style={{ background: `hsl(${hue}, 65%, 48%)` }}
                    >
                      {materia.nome.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-cp-text">
                        {materia.nome}
                      </span>
                      <span className="font-mono text-[10px] text-cp-muted">
                        Conteúdo + prática por incidência
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 font-mono text-[10px] text-red-400">
                      <BoltIcon className="h-3.5 w-3.5" />
                      Estudar
                    </span>
                  </Link>
                )
              })}
              {filtered.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-cp-muted">
                  Nenhuma matéria encontrada para “{search}”.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ResolverIncidenciaView
