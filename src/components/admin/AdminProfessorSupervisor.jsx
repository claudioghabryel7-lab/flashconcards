import { useEffect, useState, useMemo } from 'react'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import {
  AcademicCapIcon,
  ClockIcon,
  QueueListIcon,
  SignalIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../hooks/useAuth'
import {
  subscribeProfessorSupervisorConfig,
  setProfessorSupervisorEnabled,
  fetchSupervisorHistory,
  formatDailyStartLabel,
  SUPERVISOR_PHASE_LABELS,
  PROFESSOR_STEP_LABELS,
} from '../../services/professorSupervisorService'
import { subscribeGenerationJob } from '../../services/generationJobService'

dayjs.extend(duration)

const SESSION_HOURS = 8

function formatRemaining(sessionEndsAt) {
  const ends = sessionEndsAt?.toDate?.()
  if (!ends) return '—'
  const diff = ends.getTime() - Date.now()
  if (diff <= 0) return 'Encerrada'
  const d = dayjs.duration(diff)
  const h = Math.floor(d.asHours())
  const m = d.minutes()
  return `${h}h ${m}min restantes`
}

export default function AdminProfessorSupervisor() {
  const { user } = useAuth()
  const [config, setConfig] = useState({ enabled: false })
  const [liveJob, setLiveJob] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const unsub = subscribeProfessorSupervisorConfig((data) => {
      setConfig(data)
      setLoading(false)
    })
    return () => unsub?.()
  }, [])

  const jobUserId = config.automationUserId || user?.uid
  const jobId = config.currentActivity?.jobId

  useEffect(() => {
    if (!jobUserId || !jobId) {
      setLiveJob(null)
      return undefined
    }
    return subscribeGenerationJob(jobUserId, jobId, setLiveJob)
  }, [jobUserId, jobId])

  useEffect(() => {
    if (!config.enabled) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [config.enabled])

  useEffect(() => {
    fetchSupervisorHistory({ max: 15 })
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [config.lastRunAt, liveJob?.status])

  const handleToggle = async () => {
    if (!user?.uid || toggling) return
    setToggling(true)
    try {
      await setProfessorSupervisorEnabled(user.uid, !config.recurringDaily)
    } catch (err) {
      console.error(err)
      alert('Erro ao alterar o professor fiscalizador.')
    } finally {
      setToggling(false)
    }
  }

  const isScheduleOn = Boolean(config.recurringDaily)
  const dailyLabel =
    config.dailyStartHour != null
      ? formatDailyStartLabel(config.dailyStartHour, config.dailyStartMinute ?? 0)
      : null

  const activity = config.currentActivity || {}
  const phase = config.phase || 'idle'
  const phaseLabel = SUPERVISOR_PHASE_LABELS[phase] || phase
  const stepLabel = PROFESSOR_STEP_LABELS[activity.professorStep] || activity.professorStep || '—'

  const displayMessage = liveJob?.message || activity.message || config.lastMessage || '—'
  const displayProgress =
    typeof liveJob?.progress === 'number' ? liveJob.progress : activity.progress ?? null

  const nextRunLabel = useMemo(() => {
    const next = config.nextRunAt?.toDate?.()
    if (!next || phase !== 'waiting_next') return null
    const diff = next.getTime() - now
    if (diff <= 0) return 'Próximo item: em instantes'
    const m = Math.ceil(diff / 60000)
    const s = Math.ceil((diff % 60000) / 1000)
    return m > 0 ? `Próximo item em ~${m} min` : `Próximo item em ~${s}s`
  }, [config.nextRunAt, phase, now])

  const sessionRemaining = formatRemaining(config.sessionEndsAt)
  const isSessionLive =
    config.enabled && config.sessionEndsAt?.toDate?.() && config.sessionEndsAt.toDate().getTime() > now

  return (
    <div className="space-y-4">
      <div className="cp-card !rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10">
              <AcademicCapIcon className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="cp-headline text-lg text-cp-text">Professor IA — correções automáticas</h2>
              <p className="mt-1 max-w-xl text-sm text-cp-muted">
                Ao ativar, salva o <strong>horário atual</strong> e repete <strong>todo dia</strong>{' '}
                {dailyLabel ? (
                  <>
                    às <strong>{dailyLabel}</strong>
                  </>
                ) : (
                  ''
                )}
                . Sessão de até <strong>{SESSION_HOURS}h</strong> por dia. Corrige automaticamente{' '}
                <strong>sinalizações</strong> de flashcards, material e questões (sem moderação). Toda{' '}
                <strong>segunda-feira</strong> publica novo tema de redação.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              isScheduleOn
                ? 'bg-red-500/15 text-red-700 hover:bg-red-500/25 dark:text-red-300'
                : 'cp-btn-primary'
            }`}
          >
            {toggling
              ? 'Salvando…'
              : isScheduleOn
                ? 'Desativar agendamento diário'
                : 'Ativar diariamente (horário atual)'}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-4">
          <div className="flex items-center gap-2">
            <SignalIcon
              className={`h-5 w-5 ${phase === 'running' || phase === 'starting' ? 'animate-pulse text-indigo-600' : 'text-cp-muted'}`}
            />
            <p className="text-sm font-semibold text-cp-text">Ao vivo — {phaseLabel}</p>
          </div>
          <p className="mt-2 text-sm text-cp-text">{displayMessage}</p>
          {activity.label && (
            <p className="mt-1 text-xs text-cp-muted">
              Item: <span className="font-medium text-cp-text">{activity.label}</span>
              {activity.courseId && ` · Curso: ${activity.courseId}`}
            </p>
          )}
          {stepLabel !== '—' && (
            <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">{stepLabel}</p>
          )}
          {displayProgress != null && displayProgress > 0 && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-cp-border">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${Math.min(displayProgress, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-cp-muted">{displayProgress}%</p>
            </div>
          )}
          {nextRunLabel && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{nextRunLabel}</p>}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="text-cp-muted">Agendamento</p>
            <p className="font-semibold text-cp-text">
              {isScheduleOn ? `Diário ${dailyLabel || ''}` : 'Desativado'}
            </p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="text-cp-muted">Sessão</p>
            <p className="font-semibold text-cp-text">
              {isSessionLive ? sessionRemaining : config.enabled ? 'Encerrada' : isScheduleOn ? 'Aguardando' : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="text-cp-muted">Status</p>
            <p className="font-semibold text-cp-text">{phaseLabel}</p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="flex items-center gap-1 text-cp-muted">
              <QueueListIcon className="h-3.5 w-3.5" /> Fila
            </p>
            <p className="font-semibold text-cp-text">{config.queueSize ?? 0} pendente(s)</p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="flex items-center gap-1 text-cp-muted">
              <ClockIcon className="h-3.5 w-3.5" /> Sessão atual
            </p>
            <p className="font-semibold text-cp-text">{config.itemsProcessedSession ?? 0} item(ns)</p>
          </div>
        </div>
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
                  {row.autoApplied || row.skipModeration
                    ? `${row.appliedCount || 0} correção(ões) auto`
                    : 'enviado ao admin'}{' '}
                  —{' '}
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
