import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { useResolverMaterial } from '../hooks/useResolverMaterial'

const ResolverMaterialView = () => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || 'alego-default'
  const { organized, totalMateriais, loading, hasEdital } = useResolverMaterial(
    courseId,
    user,
    profile,
  )

  const [sidebarSearch, setSidebarSearch] = useState('')
  const [expandedMaterias, setExpandedMaterias] = useState({})

  const materias = useMemo(() => Object.keys(organized).sort(), [organized])

  const filteredMaterias = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase()
    if (!q) return materias
    return materias.filter((materia) => {
      if (materia.toLowerCase().includes(q)) return true
      const modulos = Object.keys(organized[materia] || {})
      return modulos.some((mod) => mod.toLowerCase().includes(q))
    })
  }, [materias, organized, sidebarSearch])

  useEffect(() => {
    if (loading || materias.length === 0) return
    setExpandedMaterias((prev) => {
      if (Object.keys(prev).length > 0) return prev
      const next = {}
      materias.forEach((m) => {
        next[m] = true
      })
      return next
    })
  }, [loading, materias])

  const toggleMateria = (materia) => {
    setExpandedMaterias((prev) => ({ ...prev, [materia]: !prev[materia] }))
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
          <p className="mt-4 text-sm text-cp-muted">Carregando materiais…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="cp-card p-4 sm:p-6">
        <div className="mb-2 flex items-center gap-2">
          <BookOpenIcon className="h-6 w-6 text-cp-accent" />
          <span className="cp-badge cp-badge-accent">Material de apoio</span>
        </div>
        <h2 className="cp-headline text-xl sm:text-2xl">Estudar material</h2>
        <p className="mt-1 text-sm text-cp-muted">
          {totalMateriais} material(is) liberado(s) no seu curso
        </p>
      </section>

      {totalMateriais === 0 && (
        <div className="cp-card p-8 text-center">
          <p className="font-medium text-cp-text">Nenhum material liberado ainda</p>
          <p className="mt-2 text-sm text-cp-muted">
            O administrador precisa gerar e liberar os tópicos no Edital Verticalizado.
          </p>
          <Link to="/edital-verticalizado" className="cp-btn-primary mt-6 inline-flex">
            Ir ao Edital Verticalizado
          </Link>
        </div>
      )}

      {totalMateriais > 0 && (
        <div className="mx-auto w-full max-w-2xl">
          <div className="cp-study-sidebar noji-deck-panel cp-card flex flex-col overflow-hidden max-h-[calc(100vh-10rem)]">
            <div className="border-b border-cp-border p-4">
              <p className="text-sm font-semibold text-cp-text">Materiais por matéria</p>
              <p className="mb-3 text-[11px] text-cp-muted">Escolha um tópico para estudar</p>
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cp-muted" />
                <input
                  type="search"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="Buscar matéria..."
                  className="w-full rounded-xl border border-cp-border bg-cp-bg/60 py-2.5 pl-9 pr-3 text-sm text-cp-text placeholder:text-cp-muted focus:border-cp-accent/50 focus:outline-none focus:ring-2 focus:ring-cp-accent/20"
                />
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {filteredMaterias.map((materia) => {
                const modulos = Object.keys(organized[materia] || {})
                const isExpanded = expandedMaterias[materia]
                const deckHue = [...materia].reduce((a, c) => a + c.charCodeAt(0), 0) % 360

                return (
                  <div
                    key={materia}
                    className="overflow-hidden rounded-2xl border border-cp-border/80 bg-cp-bg/20"
                  >
                    <button
                      type="button"
                      onClick={() => toggleMateria(materia)}
                      className="flex w-full items-center gap-2.5 px-3 py-3 text-left text-sm transition hover:bg-cp-surface/50"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
                        style={{ background: `hsl(${deckHue}, 65%, 52%)` }}
                      >
                        {materia.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-cp-text">{materia}</span>
                        <span className="text-[10px] text-cp-muted">
                          {modulos.length} tópico(s)
                        </span>
                      </span>
                      {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 shrink-0 text-cp-muted" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-cp-muted" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="space-y-0.5 border-t border-cp-border/50 px-2 py-2">
                        {modulos.map((modulo) => {
                          const entries = organized[materia][modulo] || []
                          const entry = entries[0]
                          if (!entry) return null
                          return (
                            <Link
                              key={modulo}
                              to={`/conteudo-completo/topic/${courseId}/${encodeURIComponent(entry.topicKey)}?nome=${encodeURIComponent(entry.topicoNome || modulo)}`}
                              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs text-cp-text transition hover:bg-cp-accent/10"
                            >
                              <span className="min-w-0 flex-1 truncate pr-2">{modulo}</span>
                              <span className="shrink-0 rounded-full bg-cp-accent/15 px-2 py-0.5 font-mono text-[10px] text-cp-accent">
                                Estudar
                              </span>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {!hasEdital && totalMateriais > 0 && (
        <p className="text-center text-xs text-cp-muted">
          Configure o edital verticalizado para melhor organização dos materiais.
        </p>
      )}
    </div>
  )
}

export default ResolverMaterialView
