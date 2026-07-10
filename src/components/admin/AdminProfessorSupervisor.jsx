import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { AcademicCapIcon, ClockIcon, QueueListIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../hooks/useAuth'
import {
  subscribeProfessorSupervisorConfig,
  setProfessorSupervisorEnabled,
  fetchSupervisorHistory,
} from '../../services/professorSupervisorService'

export default function AdminProfessorSupervisor() {
  const { user } = useAuth()
  const [config, setConfig] = useState({ enabled: false })
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    const unsub = subscribeProfessorSupervisorConfig((data) => {
      setConfig(data)
      setLoading(false)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    fetchSupervisorHistory({ max: 15 })
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [config.lastRunAt])

  const handleToggle = async () => {
    if (!user?.uid || toggling) return
    setToggling(true)
    try {
      await setProfessorSupervisorEnabled(user.uid, !config.enabled)
    } catch (err) {
      console.error(err)
      alert('Erro ao alterar o professor fiscalizador.')
    } finally {
      setToggling(false)
    }
  }

  const lastRun = config.lastRunAt?.toDate?.()
    ? dayjs(config.lastRunAt.toDate()).format('DD/MM/YYYY HH:mm')
    : '—'

  return (
    <div className="space-y-4">
      <div className="cp-card !rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10">
              <AcademicCapIcon className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="cp-headline text-lg text-cp-text">Professor fiscalizador (3 professores)</h2>
              <p className="mt-1 max-w-xl text-sm text-cp-muted">
                Fiscaliza na nuvem — um item por vez, só com API disponível. Script primeiro; IA só se
                necessário. Máx. {config.maxItemsPerDay || 20} itens/dia.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              config.enabled
                ? 'bg-red-500/15 text-red-700 hover:bg-red-500/25 dark:text-red-300'
                : 'cp-btn-primary'
            }`}
          >
            {toggling ? 'Salvando…' : config.enabled ? 'Desativar' : 'Ativar'}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="text-cp-muted">Status</p>
            <p className="font-semibold text-cp-text">{config.enabled ? 'Ativo na nuvem' : 'Desativado'}</p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="flex items-center gap-1 text-cp-muted">
              <QueueListIcon className="h-3.5 w-3.5" /> Fila
            </p>
            <p className="font-semibold text-cp-text">{config.queueSize ?? 0} pendente(s)</p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="flex items-center gap-1 text-cp-muted">
              <ClockIcon className="h-3.5 w-3.5" /> Hoje / última rodada
            </p>
            <p className="font-semibold text-cp-text">
              {config.itemsProcessedToday ?? 0} item(ns) — {lastRun}
            </p>
          </div>
        </div>

        {config.lastMessage && (
          <p className="mt-3 text-xs text-cp-muted">{config.lastMessage}</p>
        )}
      </div>

      {history.length > 0 && (
        <div className="cp-card !rounded-2xl p-4">
          <p className="mb-3 text-sm font-semibold text-cp-text">Histórico recente</p>
          <div className="space-y-2">
            {history.map((row) => {
              const when = row.createdAt?.toDate?.()
                ? dayjs(row.createdAt.toDate()).format('DD/MM HH:mm')
                : ''
              return (
                <div
                  key={row.id}
                  className="rounded-lg border border-cp-border px-3 py-2 text-xs text-cp-muted"
                >
                  <span className="font-medium text-cp-text">{row.itemType}</span> — {row.courseId} —{' '}
                  {row.autoApplied ? `${row.appliedCount || 0} correção(ões)` : 'enviado ao admin'} —{' '}
                  {when}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading && <p className="text-center text-sm text-cp-muted">Carregando…</p>}
    </div>
  )
}
