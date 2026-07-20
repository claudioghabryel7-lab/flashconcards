import { useEffect, useState, useMemo } from 'react'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import {
  AcademicCapIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  QueueListIcon,
  SignalIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../hooks/useAuth'
import {
  subscribeProfessorSupervisorConfig,
  setProfessorSupervisorEnabled,
  updateProfessorSupervisorWindow,
  fetchSupervisorHistory,
  clearSupervisorHistory,
  clearSupervisorQueue,
  formatDailyStartLabel,
  formatScheduleWindowLabel,
  getProfessorNextWindowInfo,
  SUPERVISOR_PHASE_LABELS,
  PROFESSOR_STEP_LABELS,
  getSaoPauloClockParts,
  defaultWindowEndHour,
} from '../../services/professorSupervisorService'
import { subscribeGenerationJob } from '../../services/generationJobService'
import { usePresenceRegistry } from '../../hooks/usePresenceRegistry'
import { forceProcessModerationNow } from '../../services/adminOnlineProfessorScheduler'

dayjs.extend(duration)

const HISTORY_MIN_KEY = 'fcc:profHistoryMinimized'

function padTime(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseTimeInput(value) {
  const [h, m] = String(value || '09:00').split(':').map((n) => Number(n))
  return {
    hour: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 9,
    minute: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  }
}

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
  const { onlineCount, loading: onlineLoading } = usePresenceRegistry({ platformWide: true })
  const [config, setConfig] = useState({ enabled: false })
  const [configError, setConfigError] = useState(null)
  const [liveJob, setLiveJob] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [clearingQueue, setClearingQueue] = useState(false)
  const [forcingModeration, setForcingModeration] = useState(false)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [historyMinimized, setHistoryMinimized] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem(HISTORY_MIN_KEY) === '1'
    } catch {
      return false
    }
  })
  const [now, setNow] = useState(Date.now())
  const [windowDirty, setWindowDirty] = useState(false)

  useEffect(() => {
    const unsub = subscribeProfessorSupervisorConfig(
      (data) => {
        setConfig(data)
        setLoading(false)
        setConfigError(data?.loadError || null)
        if (windowDirty) return
        const sh = data.windowStartHour ?? data.dailyStartHour
        const sm = data.windowStartMinute ?? data.dailyStartMinute ?? 0
        const eh = data.windowEndHour
        const em = data.windowEndMinute ?? 0
        if (sh != null) setStartTime(padTime(sh, sm))
        if (eh != null) setEndTime(padTime(eh, em))
        else if (sh != null) setEndTime(padTime(defaultWindowEndHour(Number(sh)), 0))
      },
      (err) => {
        setLoading(false)
        setConfigError(err?.message || 'Erro ao carregar configuração do Professor IA.')
      },
    )
    return () => unsub?.()
  }, [windowDirty])

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
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetchSupervisorHistory({ max: 15 })
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [config.lastRunAt, liveJob?.status])

  const handleToggle = async () => {
    if (!user?.uid || toggling) return
    setToggling(true)
    try {
      if (config.recurringDaily) {
        await setProfessorSupervisorEnabled(user.uid, false)
      } else {
        const start = parseTimeInput(startTime)
        const end = parseTimeInput(endTime)
        if (start.hour === end.hour && start.minute === end.minute) {
          alert('Horário de início e fim precisam ser diferentes.')
          return
        }
        const result = await setProfessorSupervisorEnabled(user.uid, true, {
          startHour: start.hour,
          startMinute: start.minute,
          endHour: end.hour,
          endMinute: end.minute,
        })
        setWindowDirty(false)
        if (result && result.within === false) {
          alert(
            `Agenda ativada (${result.windowLabel}).\n\nAgora está fora do horário — o Professor entra sozinho quando a janela abrir (tick na aba /admin a cada ~90s enquanto você estiver online).`,
          )
        }
      }
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Erro ao alterar o professor fiscalizador.')
    } finally {
      setToggling(false)
    }
  }

  const handleSaveWindow = async () => {
    if (!user?.uid || toggling || !config.recurringDaily) return
    setToggling(true)
    try {
      const start = parseTimeInput(startTime)
      const end = parseTimeInput(endTime)
      if (start.hour === end.hour && start.minute === end.minute) {
        alert('Horário de início e fim precisam ser diferentes.')
        return
      }
      await updateProfessorSupervisorWindow(user.uid, {
        startHour: start.hour,
        startMinute: start.minute,
        endHour: end.hour,
        endMinute: end.minute,
      })
      setWindowDirty(false)
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar horário.')
    } finally {
      setToggling(false)
    }
  }

  const toggleHistoryMinimized = () => {
    setHistoryMinimized((prev) => {
      const next = !prev
      try {
        localStorage.setItem(HISTORY_MIN_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const handleClearHistory = async () => {
    if (clearingHistory) return
    if (!window.confirm('Apagar todo o histórico do Professor IA? Esta ação não pode ser desfeita.')) {
      return
    }
    setClearingHistory(true)
    try {
      await clearSupervisorHistory()
      setHistory([])
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Erro ao apagar histórico. Faça deploy das regras do Firestore se necessário.')
    } finally {
      setClearingHistory(false)
    }
  }

  const handleForceModeration = async () => {
    if (!user?.uid || forcingModeration) return
    setForcingModeration(true)
    try {
      const result = await forceProcessModerationNow(user.uid)
      if (result?.skipped && result.reason === 'empty') {
        alert('Nenhuma sinalização aberta na Moderação.')
      } else if (result?.started) {
        alert('Correção da Moderação iniciada. Acompanhe o status abaixo.')
      }
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Erro ao iniciar correção.')
    } finally {
      setForcingModeration(false)
    }
  }

  const handleClearQueue = async () => {
    if (clearingQueue) return
    if (
      !window.confirm(
        'Limpar toda a fila do Professor IA?\n\nIsso remove itens antigos (tópicos/véspera/etc.) e deixa só as novas sinalizações da Moderação quando forem enfileiradas.\n\nNão pode ser desfeito.',
      )
    ) {
      return
    }
    setClearingQueue(true)
    try {
      const { deleted } = await clearSupervisorQueue()
      alert(`Fila limpa: ${deleted} item(ns) removido(s).`)
    } catch (err) {
      console.error(err)
      alert(
        err?.message ||
          'Erro ao limpar fila. Faça deploy das regras do Firestore (admin precisa poder deletar professorSupervisorQueue).',
      )
    } finally {
      setClearingQueue(false)
    }
  }

  const isScheduleOn = Boolean(config.recurringDaily)
  const windowLabel = formatScheduleWindowLabel(config)

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

  const clock = useMemo(() => getSaoPauloClockParts(new Date(now)), [now])
  const scheduleInfo = useMemo(
    () => getProfessorNextWindowInfo(config, new Date(now)),
    [config, now],
  )

  return (
    <div className="space-y-4">
      {configError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {configError}
        </div>
      )}
      <div className="cp-card !rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10">
              <AcademicCapIcon className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="cp-headline text-lg text-cp-text">Professor IA — correções automáticas</h2>
              <p className="mt-1 max-w-xl text-sm text-cp-muted">
                Com o painel admin aberto, corrige a aba <strong>🚩 Moderação</strong>{' '}
                automaticamente (~90s). A agenda De/Até controla a sessão e a rotação semanal do{' '}
                <strong>tema de redação</strong>. Use o botão abaixo para forçar 1 correção agora.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleForceModeration}
              disabled={forcingModeration || !user?.uid}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {forcingModeration ? 'Iniciando…' : 'Corrigir Moderação agora'}
            </button>
            <div
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"
              title="Usuários reais com presença ativa (últimos 45s)"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                {onlineLoading ? '…' : onlineCount}
              </span>
              <span className="text-xs font-semibold text-emerald-800/80 dark:text-emerald-200/80">
                online agora
              </span>
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
              {toggling ? 'Salvando…' : isScheduleOn ? 'Desativar agenda' : 'Ativar agenda (seg–dom)'}
            </button>
          </div>
        </div>

        <div
          className={`mt-4 rounded-2xl border px-4 py-3 ${
            scheduleInfo.status === 'live' || scheduleInfo.status === 'in_window_idle'
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : scheduleInfo.status === 'waiting'
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-cp-border bg-cp-surface/40'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <div>
                <p className="text-sm font-semibold text-cp-text">{scheduleInfo.label}</p>
                {scheduleInfo.countdown && (
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-cp-text">
                    ⏱ {scheduleInfo.countdown}
                    {scheduleInfo.nextAtLabel ? (
                      <span className="ml-2 text-xs font-medium text-cp-muted">
                        (≈ {scheduleInfo.nextAtLabel} BRT)
                      </span>
                    ) : null}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-cp-muted">
                  Tick local ~90s enquanto o painel admin está aberto. Agora em SP:{' '}
                  {formatDailyStartLabel(clock.hour, clock.minute)}.
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${
                isScheduleOn ? 'bg-indigo-600 text-white' : 'bg-slate-500 text-white'
              }`}
            >
              {isScheduleOn ? 'Programada' : 'Off'}
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-cp-border bg-cp-surface/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-cp-muted">
            Horário online (Brasília) — segunda a domingo
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-cp-muted">
              De
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setWindowDirty(true)
                  setStartTime(e.target.value)
                }}
                className="mt-1 block rounded-lg border border-cp-border bg-cp-bg px-3 py-2 text-sm text-cp-text"
              />
            </label>
            <label className="text-xs text-cp-muted">
              Até
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setWindowDirty(true)
                  setEndTime(e.target.value)
                }}
                className="mt-1 block rounded-lg border border-cp-border bg-cp-bg px-3 py-2 text-sm text-cp-text"
              />
            </label>
            {isScheduleOn ? (
              <button
                type="button"
                onClick={handleSaveWindow}
                disabled={toggling}
                className="rounded-xl border border-cp-border px-4 py-2 text-sm font-semibold text-cp-text transition hover:bg-cp-surface disabled:opacity-50"
              >
                Salvar horário
              </button>
            ) : (
              <p className="pb-2 text-[11px] text-cp-muted">
                Agora em SP: {formatDailyStartLabel(clock.hour, clock.minute)} — defina a janela e clique em
                Ativar.
              </p>
            )}
          </div>
          <p className="mt-2 text-[11px] text-cp-muted">
            Ex.: 09:00–17:00 → o professor só processa Moderação nesse intervalo, todos os dias da semana.
          </p>
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
            <p className="text-cp-muted">Agenda</p>
            <p className="font-semibold text-cp-text">
              {isScheduleOn ? `Seg–dom ${windowLabel}` : 'Desativada'}
            </p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="text-cp-muted">Janela de hoje</p>
            <p className="font-semibold text-cp-text">
              {isSessionLive ? sessionRemaining : config.enabled ? 'Encerrada' : isScheduleOn ? 'Aguardando' : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="text-cp-muted">Status</p>
            <p className="font-semibold text-cp-text">{phaseLabel}</p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-1 text-cp-muted">
                  <QueueListIcon className="h-3.5 w-3.5" /> Fila
                </p>
                <p className="font-semibold text-cp-text">{config.queueSize ?? 0} pendente(s)</p>
              </div>
              <button
                type="button"
                onClick={handleClearQueue}
                disabled={clearingQueue}
                title="Limpar fila (remove itens legados)"
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                {clearingQueue ? '…' : 'Limpar'}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs">
            <p className="flex items-center gap-1 text-cp-muted">
              <ClockIcon className="h-3.5 w-3.5" /> Sessão atual
            </p>
            <p className="font-semibold text-cp-text">{config.itemsProcessedSession ?? 0} item(ns)</p>
          </div>
        </div>
      </div>

      {(history.length > 0 || historyMinimized) && (
        <div className="cp-card !rounded-2xl p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cp-text">
              Histórico recente{history.length ? ` (${history.length})` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleHistoryMinimized}
                className="inline-flex items-center gap-1 rounded-lg border border-cp-border px-2 py-1 text-[11px] font-medium text-cp-muted hover:bg-cp-surface hover:text-cp-text"
              >
                {historyMinimized ? (
                  <>
                    <ChevronDownIcon className="h-3.5 w-3.5" /> Expandir
                  </>
                ) : (
                  <>
                    <ChevronUpIcon className="h-3.5 w-3.5" /> Minimizar
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleClearHistory}
                disabled={clearingHistory || history.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                {clearingHistory ? 'Apagando…' : 'Apagar histórico'}
              </button>
            </div>
          </div>

          {!historyMinimized && (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {history.length === 0 ? (
                <p className="py-4 text-center text-xs text-cp-muted">Histórico vazio.</p>
              ) : (
                history.map((row) => {
                  const when = row.createdAt?.toDate?.()
                    ? dayjs(row.createdAt.toDate()).format('DD/MM HH:mm')
                    : ''
                  return (
                    <div
                      key={row.id}
                      className="rounded-lg border border-cp-border px-3 py-2 text-xs text-cp-muted"
                    >
                      <span className="font-medium text-cp-text">{row.itemType}</span> — {row.courseId} —{' '}
                      {row.skipped
                        ? `pulado (${row.skipReason || 'ok'})`
                        : row.autoApplied || row.skipModeration
                          ? `${row.appliedCount || 0} correção(ões) auto`
                          : 'enviado ao admin'}{' '}
                      — {when}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-center text-sm text-cp-muted">Carregando…</p>}
    </div>
  )
}
