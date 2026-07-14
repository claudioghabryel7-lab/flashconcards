import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDaysIcon,
  ClockIcon,
  Cog6ToothIcon,
  LinkIcon,
  RocketLaunchIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../../hooks/useAuth'
import MentoradoDayAutomationStatus from '../guiaMentorado/MentoradoDayAutomationStatus'
import {
  applyGuiaMentoradoConfigToAllCourses,
  formatDailyReleaseLabel,
  listActiveCoursesForAdmin,
  runMentoradoBackfill,
  runMentoradoBackfillAllCourses,
  runMentoradoCronograma,
  runMentoradoToday,
  saveGuiaMentoradoAdminConfig,
  subscribeGuiaMentoradoConfig,
} from '../../services/guiaMentoradoAdminService'
import { DEFAULT_PLANNING_DAYS } from '../../constants/guiaMentorado'
import { FIREBASE_FUNCTIONS } from '../../config/firebaseFunctions'
import { auth, db } from '../../firebase/config'
import {
  CRON_STEP_MINUTES,
  getMentoradoNextRunInfo,
} from '../../utils/mentoradoNextRun'
import { loadEditalVerticalizado } from '../../utils/editalVerticalizadoLoader'

function padTime(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseTimeInput(value) {
  const [h, m] = String(value || '00:00').split(':').map((n) => Number(n))
  return {
    hour: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 0,
    minute: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  }
}

function courseLabel(c) {
  if (!c) return ''
  const name = String(c.name || '').trim()
  const competition = String(c.competition || '').trim()
  if (name && competition && name !== competition) return `${name} — ${competition}`
  return name || competition || c.id
}

function formFromConfig(data) {
  return {
    enabled: data.enabled,
    dataProva: data.dataProva || '',
    hasTAF: data.hasTAF,
    hasRedacao: data.hasRedacao,
    tafExercicios: data.tafExercicios || [],
    dailyReleaseHour: data.schedule.dailyReleaseHour,
    dailyReleaseMinute: data.schedule.dailyReleaseMinute,
    onCronogramaGenerated: data.triggers.onCronogramaGenerated,
    onDailyCron: data.triggers.onDailyCron,
    allowManualDay: data.triggers.allowManualDay,
    allowBackfill: data.triggers.allowBackfill,
    releaseOnDayComplete: data.vespera.releaseOnDayComplete,
  }
}

async function assertCronogramaDayExists(courseId, dayKey) {
  const monthKey = String(dayKey).slice(0, 7)
  const snap = await getDoc(doc(db, 'courses', courseId, 'cronograma', monthKey))
  const day = snap.exists() ? snap.data()?.days?.[dayKey] : null
  if (!day) {
    throw new Error(
      `Dia ${dayKey} não existe no cronograma deste curso. Gere o cronograma primeiro.`,
    )
  }
  return day
}

const TAF_OPTIONS = ['Barra', 'Flexão', 'Corrida', 'Abdominal', 'Shut Run', 'Salto']

const emptyForm = {
  enabled: false,
  dataProva: '',
  hasTAF: false,
  hasRedacao: false,
  tafExercicios: [],
  dailyReleaseHour: 0,
  dailyReleaseMinute: 0,
  onCronogramaGenerated: true,
  onDailyCron: true,
  allowManualDay: true,
  allowBackfill: true,
  releaseOnDayComplete: true,
}

function buildSavePayload(form, releaseTime) {
  const time = parseTimeInput(releaseTime)
  return {
    ...form,
    dataProva: form.dataProva || null,
    dailyReleaseHour: time.hour,
    dailyReleaseMinute: time.minute,
  }
}

export default function AdminGuiaMentorado() {
  const { user } = useAuth()
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState('')
  const [config, setConfig] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [releaseTime, setReleaseTime] = useState('00:00')
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [feedback, setFeedback] = useState('')
  const [progress, setProgress] = useState('')
  const [contentAuto, setContentAuto] = useState({
    enabled: true,
    lastMessage: '',
    useProfessorWindow: false,
  })
  const [contentBusy, setContentBusy] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const dirtyRef = useRef(false)
  const courseIdRef = useRef(courseId)

  const uid = user?.uid || auth?.currentUser?.uid || ''

  const todayKey = useMemo(
    () => new Date(nowTick).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
    [nowTick],
  )

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    listActiveCoursesForAdmin()
      .then((list) => {
        if (cancelled) return
        setCourses(list)
      })
      .catch((err) => setFeedback(`❌ ${err.message || 'Erro ao listar cursos.'}`))
      .finally(() => {
        if (!cancelled) setLoadingCourses(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Garante courseId válido sempre que a lista mudar (evita select “falso” com value="")
  useEffect(() => {
    if (!courses.length) return
    if (!courseId || !courses.some((c) => c.id === courseId)) {
      setCourseId(courses[0].id)
    }
  }, [courses, courseId])

  useEffect(() => {
    courseIdRef.current = courseId
  }, [courseId])

  useEffect(() => {
    if (!db) return undefined
    return onSnapshot(doc(db, 'config', 'contentAutomation'), (snap) => {
      const data = snap.exists() ? snap.data() : {}
      setContentAuto({
        enabled: data.enabled !== false,
        lastMessage: data.lastMessage || '',
        phase: data.phase || '',
        lastCourseId: data.lastCourseId || '',
        useProfessorWindow: data.useProfessorWindow === true,
      })
    })
  }, [])

  useEffect(() => {
    if (!courseId) return undefined
    dirtyRef.current = false
    setLoadingConfig(true)
    let active = true
    const subscribedId = courseId
    const unsub = subscribeGuiaMentoradoConfig(subscribedId, (data) => {
      if (!active || subscribedId !== courseIdRef.current) return
      setConfig(data)
      // Não sobrescreve edição local não salva (ex.: lastDailyRun* chegando da nuvem)
      if (!dirtyRef.current) {
        setForm(formFromConfig(data))
        setReleaseTime(padTime(data.schedule.dailyReleaseHour, data.schedule.dailyReleaseMinute))
      }
      setLoadingConfig(false)
    })
    return () => {
      active = false
      unsub?.()
    }
  }, [courseId])

  const courseName = useMemo(() => {
    const c = courses.find((x) => x.id === courseId)
    return courseLabel(c) || courseId
  }, [courses, courseId])

  const releaseLabel = formatDailyReleaseLabel({
    schedule: {
      dailyReleaseHour: form.dailyReleaseHour,
      dailyReleaseMinute: form.dailyReleaseMinute,
    },
  })

  const cloudEnabled = Boolean(config?.enabled)
  const cloudHasUser = Boolean(config?.automationUserId)

  const nextRun = useMemo(
    () =>
      getMentoradoNextRunInfo({
        enabled: cloudEnabled,
        onDailyCron: config?.triggers?.onDailyCron !== false,
        automationUserId: config?.automationUserId || null,
        dailyReleaseHour: config?.schedule?.dailyReleaseHour ?? form.dailyReleaseHour,
        dailyReleaseMinute: config?.schedule?.dailyReleaseMinute ?? form.dailyReleaseMinute,
        lastDailyRunDayKey: config?.lastDailyRunDayKey,
        now: new Date(nowTick),
      }),
    [
      cloudEnabled,
      config?.triggers?.onDailyCron,
      config?.automationUserId,
      config?.lastDailyRunDayKey,
      config?.schedule?.dailyReleaseHour,
      config?.schedule?.dailyReleaseMinute,
      form.dailyReleaseHour,
      form.dailyReleaseMinute,
      nowTick,
    ],
  )

  const patchForm = useCallback((patch) => {
    dirtyRef.current = true
    setForm((prev) => ({ ...prev, ...patch }))
  }, [])

  const persistConfig = async (nextForm, { successMessage } = {}) => {
    if (!uid || !courseId) throw new Error('Selecione um curso e faça login.')
    const payload = buildSavePayload(nextForm, releaseTime)
    const saved = await saveGuiaMentoradoAdminConfig(courseId, payload, {
      userId: uid,
      existing: config,
    })
    dirtyRef.current = false
    setConfig(saved)
    setForm(formFromConfig(saved))
    setReleaseTime(padTime(saved.schedule.dailyReleaseHour, saved.schedule.dailyReleaseMinute))
    if (successMessage) setFeedback(successMessage)
    return saved
  }

  const handleSave = async () => {
    if (!courseId || saving) return
    if (!uid) {
      setFeedback('❌ Faça login como administrador para salvar.')
      return
    }
    setSaving(true)
    setFeedback('')
    try {
      const saved = await persistConfig(form)
      setFeedback(
        `✅ Configuração salva na nuvem. Liberação diária às ${formatDailyReleaseLabel(saved)} (Brasília).${
          saved.enabled
            ? ' Cron horário ativo neste curso.'
            : ' Automação desligada — o cron ignora este curso.'
        }`,
      )
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao salvar.'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleAutomation = async () => {
    if (!courseId || saving || loadingConfig) return
    if (!uid) {
      setFeedback('❌ Faça login como administrador.')
      return
    }
    const next = !form.enabled
    const nextForm = { ...form, enabled: next }
    patchForm({ enabled: next })
    setSaving(true)
    setFeedback('')
    try {
      await persistConfig(nextForm)
      setFeedback(
        next
          ? `✅ Automação ligada na nuvem para “${courseName}”. O cron horário gera no horário ${releaseLabel} (Brasília), se o gatilho “Cron diário” estiver ativo.`
          : `⏸️ Automação desligada na nuvem para “${courseName}”. O cron não processa este curso.`,
      )
    } catch (err) {
      patchForm({ enabled: !next })
      setFeedback(`❌ ${err.message || 'Erro ao alterar automação.'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleApplyToAll = async () => {
    if (busyAction || saving) return
    if (!uid) {
      setFeedback('❌ Faça login como administrador.')
      return
    }
    const n = courses.length
    if (
      !window.confirm(
        `Aplicar a configuração atual (automação ${form.enabled ? 'LIGADA' : 'DESLIGADA'}, horário ${releaseLabel}, gatilhos e planejamento) a TODOS os ${n} cursos ativos?\n\nIsso sobrescreve a config de cada curso na nuvem.`,
      )
    ) {
      return
    }
    setBusyAction('applyAll')
    setFeedback('')
    setProgress('')
    try {
      const payload = buildSavePayload(form, releaseTime)
      const result = await applyGuiaMentoradoConfigToAllCourses(payload, {
        userId: uid,
        onProgress: setProgress,
      })
      dirtyRef.current = false
      const errText =
        result.errors.length > 0
          ? ` Falhas: ${result.errors.map((e) => e.name).join(', ')}.`
          : ''
      setFeedback(
        `✅ Configuração aplicada a ${result.count}/${result.total} curso(s) na nuvem.${errText}`,
      )
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao aplicar em todos.'}`)
    } finally {
      setBusyAction('')
      setProgress('')
    }
  }

  const handleContentAutomationToggle = async () => {
    if (!db || contentBusy) return
    setContentBusy(true)
    try {
      await setDoc(
        doc(db, 'config', 'contentAutomation'),
        {
          enabled: !contentAuto.enabled,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setFeedback(
        !contentAuto.enabled
          ? '✅ Automação de conteúdo (incidência/níveis) ligada.'
          : '⏸️ Automação de conteúdo desligada.',
      )
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao alterar automação de conteúdo.'}`)
    } finally {
      setContentBusy(false)
    }
  }

  const handleContentUseProfessorWindow = async () => {
    if (!db || contentBusy) return
    setContentBusy(true)
    try {
      await setDoc(
        doc(db, 'config', 'contentAutomation'),
        {
          useProfessorWindow: !contentAuto.useProfessorWindow,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao alterar janela.'}`)
    } finally {
      setContentBusy(false)
    }
  }

  const handleRunContentAutomationNow = async () => {
    if (contentBusy) return
    const userAuth = auth?.currentUser
    if (!userAuth) {
      setFeedback('❌ Faça login como admin.')
      return
    }
    setContentBusy(true)
    setFeedback('')
    try {
      const token = await userAuth.getIdToken()
      const response = await fetch(FIREBASE_FUNCTIONS.runContentAutomationNow, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ force: true }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Falha ao disparar automação')
      if (data.started) {
        setFeedback(
          `🚀 Conteúdo: ${data.kind} — ${data.label || data.courseId} (job ${data.jobId})`,
        )
      } else {
        setFeedback(`ℹ️ Automação: ${data.reason || 'nada pendente'} (${data.source || 'ok'})`)
      }
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao disparar automação de conteúdo.'}`)
    } finally {
      setContentBusy(false)
    }
  }

  const withAction = async (key, fn) => {
    if (!uid) {
      setFeedback('❌ Faça login como administrador para continuar.')
      return
    }
    if (!courseId) {
      setFeedback('❌ Selecione um curso antes de continuar.')
      return
    }
    if (busyAction) {
      setFeedback('⏳ Aguarde a ação em andamento terminar.')
      return
    }
    setBusyAction(key)
    setFeedback('')
    setProgress('')
    try {
      await fn(uid)
    } catch (err) {
      console.error(`[AdminGuiaMentorado] ${key}:`, err)
      setFeedback(`❌ ${err.message || 'Falha na ação.'}`)
    } finally {
      setBusyAction('')
      setProgress('')
    }
  }

  const handleCronograma = () =>
    withAction('cronograma', async (userId) => {
      setProgress('Verificando edital verticalizado…')
      const edital = await loadEditalVerticalizado(courseId)
      if (!edital?.disciplinas?.length) {
        throw new Error(
          'Edital verticalizado não encontrado neste curso. Gere o edital primeiro (Admin → Edital) e tente de novo.',
        )
      }

      setProgress('Salvando configuração…')
      await persistConfig(form)

      setProgress('Enfileirando geração do cronograma na nuvem…')
      const { jobId } = await runMentoradoCronograma({
        userId,
        courseId,
        config: {
          ...form,
          dataProva: form.dataProva || null,
          enabled: form.enabled,
          schedule: {
            dailyReleaseHour: form.dailyReleaseHour,
            dailyReleaseMinute: form.dailyReleaseMinute,
          },
          triggers: {
            onCronogramaGenerated: form.onCronogramaGenerated,
            onDailyCron: form.onDailyCron,
            allowManualDay: form.allowManualDay,
            allowBackfill: form.allowBackfill,
          },
          vespera: { releaseOnDayComplete: form.releaseOnDayComplete },
        },
      })

      setFeedback(
        form.enabled && form.onCronogramaGenerated
          ? `🚀 Cronograma enfileirado (job ${String(jobId).slice(0, 8)}…). Ao concluir, inicia o dia de hoje. Acompanhe o banner.`
          : `🚀 Cronograma enfileirado (job ${String(jobId).slice(0, 8)}…). Acompanhe o banner no canto.`,
      )
    })

  const handleToday = () =>
    withAction('today', async (userId) => {
      if (!form.allowManualDay) {
        throw new Error('Geração manual desabilitada neste curso. Ative em Gatilhos e salve.')
      }
      setProgress('Verificando cronograma de hoje…')
      await assertCronogramaDayExists(courseId, todayKey)
      setProgress('Verificando edital…')
      const edital = await loadEditalVerticalizado(courseId)
      if (!edital?.disciplinas?.length) {
        throw new Error('Edital verticalizado não encontrado. Gere o edital primeiro.')
      }
      const { topicCount } = await runMentoradoToday({
        userId,
        courseId,
        targetDate: todayKey,
      })
      setFeedback(`🚀 Gerando ${topicCount} tópico(s) de hoje. Acompanhe abaixo e no banner.`)
    })

  const handleBackfill = () =>
    withAction('backfill', async (userId) => {
      if (!form.allowBackfill) {
        throw new Error('Backfill desabilitado neste curso. Ative em Gatilhos e salve.')
      }
      if (
        !window.confirm(
          `Gerar conteúdos faltantes de “${courseName}” (1º dia do cronograma → hoje)?\n\nUm job na nuvem processa dia a dia com retomada automática.`,
        )
      ) {
        return
      }
      setProgress('Verificando edital e cronograma…')
      const edital = await loadEditalVerticalizado(courseId)
      if (!edital?.disciplinas?.length) {
        throw new Error('Edital verticalizado não encontrado. Gere o edital primeiro.')
      }
      const { dayCount } = await runMentoradoBackfill({
        userId,
        courseId,
        courseName,
      })
      setFeedback(`🚀 Backfill iniciado (${dayCount} dia(s)). Acompanhe no banner.`)
    })

  const handleBackfillAll = () =>
    withAction('backfillAll', async (userId) => {
      if (
        !window.confirm(
          'Gerar Guia Mentorado em massa (dia 1 → hoje)?\n\nSó cursos com automação ativa. 1 curso por vez.',
        )
      ) {
        return
      }
      const { jobs } = await runMentoradoBackfillAllCourses(userId, setProgress)
      setFeedback(`✅ ${jobs.length} job(s) enfileirado(s). Acompanhe no banner.`)
    })

  const busy = Boolean(busyAction) || saving

  return (
    <div className="space-y-4">
      <div className="cp-card !rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
              <CalendarDaysIcon className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="cp-headline text-lg text-cp-text">Guia Mentorado — automação unificada</h2>
              <p className="mt-1 max-w-2xl text-sm text-cp-muted">
                Um painel por curso: liga/desliga a geração diária, define o horário (Brasília),
                controla gatilhos (cronograma, cron, backfill, véspera) e dispara ações manuais.
                O cron horário só processa o curso na hora configurada — sem religar a automação
                sozinha.
              </p>
            </div>
          </div>
          <a
            href="/guia-mentorado"
            className="inline-flex items-center gap-2 rounded-xl border border-cp-border px-3 py-2 text-sm text-cp-text transition hover:bg-cp-surface"
          >
            <LinkIcon className="h-4 w-4" />
            Abrir calendário
          </a>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-xs font-semibold uppercase tracking-wide text-cp-muted">
            Curso
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={loadingCourses}
              className="mt-1 w-full rounded-xl border border-cp-border bg-cp-bg px-3 py-2.5 text-sm text-cp-text"
            >
              {!courses.length && <option value="">Nenhum curso ativo</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {courseLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleToggleAutomation}
            disabled={loadingConfig || saving || !courseId || !uid}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
              form.enabled
                ? 'bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-200'
                : 'bg-slate-500/15 text-slate-700 hover:bg-slate-500/25 dark:text-slate-200'
            }`}
            title="Grava imediatamente na nuvem (Firestore)"
          >
            {saving && !busyAction
              ? 'Salvando…'
              : form.enabled
                ? 'Automação ligada'
                : 'Automação desligada'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              cloudEnabled
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
            }`}
          >
            Nuvem: {cloudEnabled ? 'ATIVA' : 'OFF'}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              cloudHasUser
                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            }`}
          >
            {cloudHasUser ? 'Usuário de automação OK' : 'Sem usuário — clique em Ligar/Salvar'}
          </span>
          <span className="rounded-full bg-cp-surface px-2.5 py-1 text-cp-muted">
            Cron a cada {CRON_STEP_MINUTES} min (Brasília)
          </span>
        </div>

        <div
          className={`mt-4 rounded-2xl border px-4 py-3 ${
            nextRun.ready
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-amber-500/30 bg-amber-500/10'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <ClockIcon
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  nextRun.ready ? 'text-emerald-600' : 'text-amber-600'
                }`}
              />
              <div>
                <p className="text-sm font-semibold text-cp-text">{nextRun.label}</p>
                {nextRun.countdown && nextRun.status !== 'due' && (
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-cp-text">
                    ⏱ {nextRun.countdown}
                    {nextRun.nextAtLabel ? (
                      <span className="ml-2 text-xs font-medium text-cp-muted">
                        (≈ {nextRun.nextAtLabel} BRT)
                      </span>
                    ) : null}
                  </p>
                )}
                {nextRun.blockers.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-[11px] text-amber-800 dark:text-amber-200">
                    {nextRun.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-cp-muted">
                  Com automação ligada + “Cron diário” + Salvar/Aplicar, o servidor
                  `mentoradoDailyContentRelease` gera o dia (e pendências) sozinho. Precisa de
                  cronograma no curso.
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${
                nextRun.ready
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-600 text-white'
              }`}
            >
              {nextRun.ready ? 'Programada' : 'Incompleta'}
            </span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-cp-border bg-cp-surface/60 px-4 py-3 text-sm text-cp-text">
          {feedback}
        </div>
      )}
      {progress && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
          {progress}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="cp-card !rounded-2xl space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Cog6ToothIcon className="h-5 w-5 text-cp-muted" />
            <h3 className="text-sm font-semibold text-cp-text">Planejamento</h3>
          </div>

          <label className="block text-xs text-cp-muted">
            Data da prova (opcional)
            <input
              type="date"
              value={form.dataProva || ''}
              onChange={(e) => patchForm({ dataProva: e.target.value })}
              className="mt-1 w-full rounded-lg border border-cp-border bg-cp-bg px-3 py-2 text-sm text-cp-text"
            />
            <span className="mt-1 block text-[11px]">
              Se vazio, usa {DEFAULT_PLANNING_DAYS} dias a partir de hoje.
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm text-cp-text">
            <input
              type="checkbox"
              checked={form.hasTAF}
              onChange={(e) => patchForm({ hasTAF: e.target.checked })}
              className="rounded"
            />
            Possui TAF
          </label>

          <label className="flex items-center gap-2 text-sm text-cp-text">
            <input
              type="checkbox"
              checked={form.hasRedacao}
              onChange={(e) => patchForm({ hasRedacao: e.target.checked })}
              className="rounded"
            />
            Possui redação (rotação semanal de tema)
          </label>

          {form.hasTAF && (
            <div className="grid grid-cols-2 gap-2">
              {TAF_OPTIONS.map((exercicio) => (
                <label key={exercicio} className="flex items-center gap-2 text-sm text-cp-text">
                  <input
                    type="checkbox"
                    checked={form.tafExercicios?.includes(exercicio)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...(form.tafExercicios || []), exercicio]
                        : (form.tafExercicios || []).filter((x) => x !== exercicio)
                      patchForm({ tafExercicios: next })
                    }}
                    className="rounded"
                  />
                  {exercicio}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="cp-card !rounded-2xl space-y-4 p-5">
          <div className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-cp-muted" />
            <h3 className="text-sm font-semibold text-cp-text">Agenda diária</h3>
          </div>

          <label className="block text-xs text-cp-muted">
            Horário de liberação (Brasília)
            <input
              type="time"
              value={releaseTime}
              onChange={(e) => {
                dirtyRef.current = true
                setReleaseTime(e.target.value)
                const t = parseTimeInput(e.target.value)
                patchForm({ dailyReleaseHour: t.hour, dailyReleaseMinute: t.minute })
              }}
              className="mt-1 block rounded-lg border border-cp-border bg-cp-bg px-3 py-2 text-sm text-cp-text"
            />
            <span className="mt-1 block text-[11px]">
              O servidor verifica a cada {CRON_STEP_MINUTES} min. Dispara a partir de {releaseLabel}{' '}
              (Brasília), 1 vez por dia.
            </span>
          </label>

          <div className="space-y-2 rounded-xl border border-cp-border bg-cp-surface/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cp-muted">Gatilhos</p>
            {[
              ['onDailyCron', 'Cron diário (no horário)'],
              ['onCronogramaGenerated', 'Ao gerar cronograma, iniciar o dia de hoje'],
              ['allowManualDay', 'Permitir “Gerar hoje” manual'],
              ['allowBackfill', 'Permitir backfill (dias passados)'],
              ['releaseOnDayComplete', 'Liberar 1 disciplina da Véspera ao concluir o dia'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-start gap-2 text-sm text-cp-text">
                <input
                  type="checkbox"
                  checked={Boolean(form[key])}
                  onChange={(e) => patchForm({ [key]: e.target.checked })}
                  className="mt-0.5 rounded"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {config?.lastDailyRunDayKey && (
            <p className="text-xs text-cp-muted">
              Última passagem do cron: <strong>{config.lastDailyRunDayKey}</strong>
              {config.lastError ? ` — ${config.lastError}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || loadingConfig || !courseId}
          className="cp-btn-primary !text-sm disabled:opacity-50"
        >
          {saving && !busyAction ? 'Salvando…' : 'Salvar configuração'}
        </button>
        <button
          type="button"
          onClick={handleApplyToAll}
          disabled={busy || loadingConfig || courses.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-200"
        >
          {busyAction === 'applyAll'
            ? 'Aplicando…'
            : `Aplicar a todos os cursos (${courses.length})`}
        </button>
        <button
          type="button"
          onClick={handleCronograma}
          disabled={busy || !courseId || loadingCourses}
          title={
            !courseId
              ? 'Selecione um curso'
              : busy
                ? 'Aguarde a ação em andamento'
                : 'Gerar cronograma na nuvem'
          }
          className="inline-flex items-center gap-2 rounded-xl border border-cp-border px-4 py-2 text-sm font-semibold text-cp-text transition hover:bg-cp-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SparklesIcon className={`h-4 w-4 ${busyAction === 'cronograma' ? 'animate-pulse' : ''}`} />
          {busyAction === 'cronograma' ? 'Gerando…' : 'Gerar cronograma'}
        </button>
        <button
          type="button"
          onClick={handleToday}
          disabled={busy || !courseId}
          className="inline-flex items-center gap-2 rounded-xl border border-cp-border px-4 py-2 text-sm font-semibold text-cp-text transition hover:bg-cp-surface disabled:opacity-50"
        >
          <RocketLaunchIcon className={`h-4 w-4 ${busyAction === 'today' ? 'animate-pulse' : ''}`} />
          {busyAction === 'today' ? 'Iniciando…' : 'Gerar conteúdos de hoje'}
        </button>
        <button
          type="button"
          onClick={handleBackfill}
          disabled={busy || !courseId}
          className="inline-flex items-center gap-2 rounded-xl border border-cp-border px-4 py-2 text-sm font-semibold text-cp-text transition hover:bg-cp-surface disabled:opacity-50"
        >
          <RocketLaunchIcon className={`h-4 w-4 ${busyAction === 'backfill' ? 'animate-pulse' : ''}`} />
          {busyAction === 'backfill' ? 'Iniciando…' : 'Backfill deste curso'}
        </button>
        <button
          type="button"
          onClick={handleBackfillAll}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          {busyAction === 'backfillAll' ? 'Iniciando…' : 'Backfill em massa (1 curso)'}
        </button>
      </div>

      {courseId ? (
        <MentoradoDayAutomationStatus
          courseId={courseId}
          targetDate={todayKey}
          userId={uid}
          onGenerateToday={handleToday}
          onGeneratePastDays={handleBackfill}
          generating={busyAction === 'today'}
          generatingPastDays={busyAction === 'backfill'}
        />
      ) : null}

      <div className="cp-card !rounded-2xl space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-cp-text">Automação de conteúdo (global)</h3>
            <p className="mt-1 max-w-2xl text-xs text-cp-muted">
              Independente do Professor IA. A cada 30 min libera 1 job (incidência → níveis).
              Janela padrão 06:00–23:00 (Brasília). Não gasta API se o conteúdo já existir.
            </p>
            {contentAuto.lastMessage && (
              <p className="mt-2 text-xs text-cp-muted">
                Último: {contentAuto.lastMessage}
                {contentAuto.phase ? ` · fase ${contentAuto.phase}` : ''}
              </p>
            )}
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-cp-text">
              <input
                type="checkbox"
                className="mt-0.5 rounded"
                checked={Boolean(contentAuto.useProfessorWindow)}
                onChange={handleContentUseProfessorWindow}
                disabled={contentBusy}
              />
              <span>
                Usar a mesma janela De/Até do <strong>Professor IA</strong> (opcional — desligado por
                padrão para não conflitar)
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleContentAutomationToggle}
              disabled={contentBusy}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                contentAuto.enabled
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                  : 'bg-slate-500/15 text-slate-700 dark:text-slate-200'
              }`}
            >
              {contentAuto.enabled ? 'Conteúdo ligado' : 'Conteúdo desligado'}
            </button>
            <button
              type="button"
              onClick={handleRunContentAutomationNow}
              disabled={contentBusy}
              className="rounded-xl bg-violet-600/90 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {contentBusy ? 'Disparando…' : 'Rodar 1 job agora'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
