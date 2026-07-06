import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import {
  BellIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  FireIcon,
  ListBulletIcon,
  PencilSquareIcon,
  PlayIcon,
  PlusIcon,
  PauseIcon,
  StopIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { db } from '../firebase/config'
import StudyTimeChart from '../components/StudyTimeChart'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import toast from 'react-hot-toast'
import { saveManualEntry, saveTimerSession, firestoreErrorMessage } from '../services/trilhaSaveService'

const DEFAULT_CONFIG = {
  cycle: ['Português', 'Direito Constitucional', 'Direito Administrativo'],
  goals: {
    daily: 3,
    weekly: 18,
    monthly: 72,
  },
  revisionAlerts: [],
}

const DEFAULT_FORM = {
  materia: '',
  assunto: '',
  modalidade: 'teoria',
  minutos: 30,
  acertos: 0,
  erros: 0,
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function playAlarm() {
  if (typeof window === 'undefined') return
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return

  const ctx = new AudioContextClass()
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(880, ctx.currentTime)
  gainNode.gain.setValueAtTime(0.001, ctx.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)
  oscillator.start()
  oscillator.stop(ctx.currentTime + 0.6)
}

export default function Trilha() {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || null

  const [timerActive, setTimerActive] = useState(false)
  const [timerPaused, setTimerPaused] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [alarmMinutes, setAlarmMinutes] = useState(50)
  const [alarmTriggered, setAlarmTriggered] = useState(false)
  const [timerForm, setTimerForm] = useState({
    materia: '',
    assunto: '',
    modalidade: 'teoria',
  })
  const [manualForm, setManualForm] = useState(DEFAULT_FORM)
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [cycleInput, setCycleInput] = useState(DEFAULT_CONFIG.cycle.join(', '))
  const [revisionInput, setRevisionInput] = useState('')
  const [sessions, setSessions] = useState([])
  const [manualEntries, setManualEntries] = useState([])
  const [questionStats, setQuestionStats] = useState({ total: 0, correct: 0, wrong: 0 })
  const [savingSession, setSavingSession] = useState(false)

  const intervalRef = useRef(null)

  useEffect(() => {
    if (!timerActive || timerPaused) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      return
    }

    intervalRef.current = setInterval(() => {
      setElapsedSeconds((current) => current + 1)
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [timerActive, timerPaused])

  useEffect(() => {
    if (!timerActive || alarmTriggered || !alarmMinutes) return
    if (elapsedSeconds < alarmMinutes * 60) return

    playAlarm()
    setAlarmTriggered(true)
  }, [alarmMinutes, alarmTriggered, elapsedSeconds, timerActive])

  useEffect(() => {
    if (!user?.uid) return () => {}

    const configRef = doc(db, 'users', user.uid, 'trilha', 'config')
    const unsubConfig = onSnapshot(configRef, (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      const merged = {
        ...DEFAULT_CONFIG,
        ...data,
        goals: { ...DEFAULT_CONFIG.goals, ...(data.goals || {}) },
        revisionAlerts: data.revisionAlerts || [],
      }
      setConfig(merged)
      setCycleInput((merged.cycle || []).join(', '))
    })

    const unsubSessions = onSnapshot(
      collection(db, 'users', user.uid, 'trilhaSessions'),
      (snap) => {
        const rows = snap.docs.map((item) => ({ id: item.id, ...item.data() }))
        rows.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0
          const bTime = b.createdAt?.toMillis?.() || 0
          return bTime - aTime
        })
        setSessions(rows)
      },
      (err) => console.error('Erro ao carregar sessões da Trilha:', err),
    )

    const unsubManual = onSnapshot(
      collection(db, 'users', user.uid, 'trilhaManualEntries'),
      (snap) => {
        const rows = snap.docs.map((item) => ({ id: item.id, ...item.data() }))
        rows.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0
          const bTime = b.createdAt?.toMillis?.() || 0
          return bTime - aTime
        })
        setManualEntries(rows)
      },
      (err) => console.error('Erro ao carregar registros manuais:', err),
    )

    const loadQuestionStats = async () => {
      const courseKey = courseId || 'alego'
      const statsRef = doc(db, 'questoesStats', `${user.uid}_${courseKey}`)
      const snap = await getDoc(statsRef)
      if (!snap.exists()) return
      const byMateria = snap.data().byMateria || {}
      const totals = Object.values(byMateria).reduce(
        (acc, item) => {
          acc.correct += item.correct || 0
          acc.wrong += item.wrong || 0
          return acc
        },
        { correct: 0, wrong: 0 },
      )
      setQuestionStats({
        total: totals.correct + totals.wrong,
        correct: totals.correct,
        wrong: totals.wrong,
      })
    }

    loadQuestionStats()

    return () => {
      unsubConfig()
      unsubSessions()
      unsubManual()
    }
  }, [courseId, user?.uid])

  const sessionHours = useMemo(
    () => sessions.reduce((sum, item) => sum + (item.durationMinutes || 0) / 60, 0),
    [sessions],
  )
  const manualHours = useMemo(
    () => manualEntries.reduce((sum, item) => sum + (item.minutos || 0) / 60, 0),
    [manualEntries],
  )
  const totalHours = sessionHours + manualHours

  const categoryBreakdown = useMemo(() => {
    const totals = {}
    ;[...sessions, ...manualEntries].forEach((item) => {
      const key = item.modalidade || 'teoria'
      const minutes = item.durationMinutes || item.minutos || 0
      totals[key] = (totals[key] || 0) + minutes
    })
    return Object.entries(totals)
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
  }, [manualEntries, sessions])

  const nextMateria = useMemo(() => {
    const cycle = config.cycle || []
    if (!cycle.length) return 'Defina seu ciclo'
    const studiedNames = [...sessions, ...manualEntries]
      .map((item) => item.materia)
      .filter(Boolean)
    if (!studiedNames.length) return cycle[0]
    const last = studiedNames[0]
    const index = cycle.findIndex((item) => item === last)
    return cycle[(index + 1 + cycle.length) % cycle.length] || cycle[0]
  }, [config.cycle, manualEntries, sessions])

  const saveConfig = async (nextConfig) => {
    if (!user?.uid) return false
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'trilha', 'config'),
        {
          ...nextConfig,
          courseId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      return true
    } catch (err) {
      console.error('Erro ao salvar config da Trilha:', err)
      toast.error('Não foi possível salvar. Tente novamente.')
      return false
    }
  }

  const handleStart = () => {
    setAlarmTriggered(false)
    setTimerActive(true)
    setTimerPaused(false)
  }

  const handlePause = () => {
    setTimerPaused((current) => !current)
  }

  const handleStop = async () => {
    if (!user?.uid || elapsedSeconds <= 0) {
      setTimerActive(false)
      setTimerPaused(false)
      setElapsedSeconds(0)
      return
    }

    if (!timerForm.materia?.trim()) {
      toast.error('Informe a matéria antes de encerrar e salvar.')
      return
    }

    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60))
    setSavingSession(true)
    try {
      await saveTimerSession({
        user,
        profile,
        courseId,
        timerForm,
        durationMinutes,
        elapsedSeconds,
      })
      toast.success('Sessão salva!')
      setTimerActive(false)
      setTimerPaused(false)
      setElapsedSeconds(0)
      setAlarmTriggered(false)
    } catch (err) {
      console.error('Erro ao salvar sessão da Trilha:', err)
      toast.error(
        err?.message?.includes('matéria')
          ? err.message
          : firestoreErrorMessage(err, 'Erro ao salvar sessão.'),
      )
    } finally {
      setSavingSession(false)
    }
  }

  const handleManualSave = async () => {
    if (!user?.uid || !manualForm.materia || !manualForm.minutos) return

    setSavingSession(true)
    try {
      await saveManualEntry({ user, profile, courseId, manualForm })
      setManualForm(DEFAULT_FORM)
      toast.success('Registro salvo!')
    } catch (err) {
      console.error('Erro ao salvar registro manual:', err)
      toast.error(firestoreErrorMessage(err, 'Erro ao salvar registro.'))
    } finally {
      setSavingSession(false)
    }
  }

  const handleSaveCycle = async () => {
    const cycle = cycleInput
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const nextConfig = { ...config, cycle }
    setConfig(nextConfig)
    if (await saveConfig(nextConfig)) toast.success('Ciclo salvo!')
  }

  const handleSaveGoals = async (field, value) => {
    const nextConfig = {
      ...config,
      goals: {
        ...config.goals,
        [field]: Number(value) || 0,
      },
    }
    setConfig(nextConfig)
    await saveConfig(nextConfig)
  }

  const handleAddRevision = async () => {
    if (!revisionInput.trim()) return
    const revisionAlerts = [...(config.revisionAlerts || []), revisionInput.trim()].slice(-8)
    const nextConfig = { ...config, revisionAlerts }
    setConfig(nextConfig)
    setRevisionInput('')
    await saveConfig(nextConfig)
  }

  return (
    <div className="space-y-8 pb-10">
      <CPPageHeader
        badge="Trilha"
        title="Trilha de estudo"
        subtitle="Cronômetro líquido, ciclo, metas, lançamentos manuais e visão consolidada do seu desempenho."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="cp-card p-5">
          <p className="text-xs text-cp-muted">Horas registradas</p>
          <p className="mt-2 text-2xl font-semibold text-cp-text">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="cp-card p-5">
          <p className="text-xs text-cp-muted">Próxima matéria do ciclo</p>
          <p className="mt-2 text-base font-medium text-cp-text">{nextMateria}</p>
        </div>
        <div className="cp-card p-5">
          <p className="text-xs text-cp-muted">Questões resolvidas</p>
          <p className="mt-2 text-2xl font-semibold text-cp-text">{questionStats.total}</p>
          <p className="mt-1 text-xs text-cp-muted">
            {questionStats.correct} acertos · {questionStats.wrong} erros
          </p>
        </div>
        <div className="cp-card p-5">
          <p className="text-xs text-cp-muted">Meta diária</p>
          <p className="mt-2 text-2xl font-semibold text-cp-text">{config.goals.daily}h</p>
          <p className="mt-1 text-xs text-cp-muted">
            semanal {config.goals.weekly}h · mensal {config.goals.monthly}h
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="cp-card p-6">
          <div className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-cp-accent" />
            <h2 className="text-lg font-semibold text-cp-text">Cronômetro de horas líquidas</h2>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-cp-muted">
              Matéria
              <input
                value={timerForm.materia}
                onChange={(e) => setTimerForm((current) => ({ ...current, materia: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                placeholder="Ex.: Direito Constitucional"
              />
            </label>
            <label className="text-sm text-cp-muted">
              Assunto
              <input
                value={timerForm.assunto}
                onChange={(e) => setTimerForm((current) => ({ ...current, assunto: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                placeholder="Ex.: Controle de constitucionalidade"
              />
            </label>
            <label className="text-sm text-cp-muted">
              Modalidade
              <select
                value={timerForm.modalidade}
                onChange={(e) => setTimerForm((current) => ({ ...current, modalidade: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
              >
                <option value="teoria">Teoria</option>
                <option value="revisao">Revisão</option>
                <option value="exercicios">Exercícios</option>
                <option value="lei-seca">Lei seca</option>
              </select>
            </label>
            <label className="text-sm text-cp-muted">
              Alarme do bloco (min)
              <input
                type="number"
                min="0"
                value={alarmMinutes}
                onChange={(e) => setAlarmMinutes(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
              />
            </label>
          </div>

          <div className="mt-6 rounded-2xl border border-cp-accent/20 bg-cp-accent/10 p-6 text-center">
            <p className="font-mono text-4xl font-semibold text-cp-text">{formatDuration(elapsedSeconds)}</p>
            <p className="mt-2 text-sm text-cp-muted">
              {timerPaused ? 'Pausado' : timerActive ? 'Foco em andamento' : 'Pronto para iniciar'}
            </p>
            {alarmTriggered && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                <BellIcon className="h-4 w-4" />
                Bloco finalizado
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={handleStart} className="cp-btn-primary">
              <PlayIcon className="h-4 w-4" />
              {timerActive ? 'Reiniciar foco' : 'Iniciar'}
            </button>
            <button onClick={handlePause} disabled={!timerActive} className="cp-btn-ghost disabled:opacity-50">
              <PauseIcon className="h-4 w-4" />
              {timerPaused ? 'Retomar' : 'Pausar'}
            </button>
            <button
              onClick={handleStop}
              disabled={savingSession || (!timerActive && elapsedSeconds === 0)}
              className="cp-btn-ghost disabled:opacity-50"
            >
              <StopIcon className="h-4 w-4" />
              {savingSession ? 'Salvando...' : 'Encerrar e salvar'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="cp-card p-6">
            <div className="flex items-center gap-2">
              <PencilSquareIcon className="h-5 w-5 text-cp-accent2" />
              <h2 className="text-lg font-semibold text-cp-text">Registro manual</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <input
                value={manualForm.materia}
                onChange={(e) => setManualForm((current) => ({ ...current, materia: e.target.value }))}
                className="rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                placeholder="Matéria"
              />
              <input
                value={manualForm.assunto}
                onChange={(e) => setManualForm((current) => ({ ...current, assunto: e.target.value }))}
                className="rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                placeholder="Assunto"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={manualForm.modalidade}
                  onChange={(e) => setManualForm((current) => ({ ...current, modalidade: e.target.value }))}
                  className="rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                >
                  <option value="teoria">Teoria</option>
                  <option value="revisao">Revisão</option>
                  <option value="exercicios">Exercícios</option>
                  <option value="lei-seca">Lei seca</option>
                </select>
                <input
                  type="number"
                  min="1"
                  value={manualForm.minutos}
                  onChange={(e) => setManualForm((current) => ({ ...current, minutos: Number(e.target.value) || 0 }))}
                  className="rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                  placeholder="Minutos"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min="0"
                  value={manualForm.acertos}
                  onChange={(e) => setManualForm((current) => ({ ...current, acertos: Number(e.target.value) || 0 }))}
                  className="rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                  placeholder="Acertos"
                />
                <input
                  type="number"
                  min="0"
                  value={manualForm.erros}
                  onChange={(e) => setManualForm((current) => ({ ...current, erros: Number(e.target.value) || 0 }))}
                  className="rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                  placeholder="Erros"
                />
              </div>
              <button onClick={handleManualSave} disabled={savingSession} className="cp-btn-primary disabled:opacity-50">
                <PlusIcon className="h-4 w-4" />
                Salvar registro
              </button>
            </div>
          </div>

          <div className="cp-card p-6">
            <div className="flex items-center gap-2">
              <ListBulletIcon className="h-5 w-5 text-cp-accent2" />
              <h2 className="text-lg font-semibold text-cp-text">Ciclo e metas</h2>
            </div>
            <label className="mt-4 block text-sm text-cp-muted">
              Ciclo de estudos
              <textarea
                value={cycleInput}
                onChange={(e) => setCycleInput(e.target.value)}
                className="mt-1 min-h-[90px] w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                placeholder="Português, Direito Constitucional, Informática..."
              />
            </label>
            <button onClick={handleSaveCycle} className="cp-btn-ghost mt-3">
              Salvar ciclo
            </button>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {['daily', 'weekly', 'monthly'].map((field) => (
                <label key={field} className="text-sm text-cp-muted">
                  {field === 'daily' ? 'Dia' : field === 'weekly' ? 'Semana' : 'Mês'}
                  <input
                    type="number"
                    min="0"
                    value={config.goals[field]}
                    onChange={(e) => handleSaveGoals(field, e.target.value)}
                    className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="cp-card p-6">
            <div className="flex items-center gap-2">
              <BellIcon className="h-5 w-5 text-cp-accent2" />
              <h2 className="text-lg font-semibold text-cp-text">Alertas de revisão</h2>
            </div>
            <div className="mt-4 flex gap-2">
              <input
                value={revisionInput}
                onChange={(e) => setRevisionInput(e.target.value)}
                className="flex-1 rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                placeholder="Ex.: Revisar Processo Penal em 7 dias"
              />
              <button onClick={handleAddRevision} className="cp-btn-ghost">
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {(config.revisionAlerts || []).length === 0 && (
                <p className="text-sm text-cp-muted">Nenhum alerta cadastrado.</p>
              )}
              {(config.revisionAlerts || []).map((item) => (
                <div key={item} className="rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-sm text-cp-text">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="cp-card p-6">
          <div className="flex items-center gap-2">
            <ChartBarIcon className="h-5 w-5 text-cp-accent2" />
            <h2 className="text-lg font-semibold text-cp-text">Relatórios</h2>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-cp-border bg-cp-surface p-4">
              <p className="text-xs text-cp-muted">Distribuição por modalidade</p>
              <div className="mt-3 space-y-2">
                {categoryBreakdown.length === 0 && (
                  <p className="text-sm text-cp-muted">Sem dados ainda.</p>
                )}
                {categoryBreakdown.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-cp-text">{item.name.replace('-', ' ')}</span>
                    <span className="font-mono text-cp-muted">{item.minutes} min</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-cp-border bg-cp-surface p-4">
              <p className="text-xs text-cp-muted">Aproveitamento em exercícios</p>
              <p className="mt-3 text-3xl font-semibold text-cp-text">
                {questionStats.total > 0
                  ? `${Math.round((questionStats.correct / questionStats.total) * 100)}%`
                  : '0%'}
              </p>
              <p className="mt-2 text-sm text-cp-muted">
                {questionStats.correct} acertos e {questionStats.wrong} erros
              </p>
            </div>
          </div>
        </div>

        <div className="cp-card p-6">
          <div className="flex items-center gap-2">
            <FireIcon className="h-5 w-5 text-cp-accent2" />
            <h2 className="text-lg font-semibold text-cp-text">Histórico recente</h2>
          </div>
          <div className="mt-4 space-y-3">
            {[...sessions.slice(0, 4), ...manualEntries.slice(0, 4)]
              .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
              .slice(0, 6)
              .map((item) => (
                <div key={item.id} className="rounded-2xl border border-cp-border bg-cp-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-cp-text">{item.materia || 'Sem matéria'}</p>
                      <p className="text-sm text-cp-muted">{item.assunto || 'Sem assunto'}</p>
                    </div>
                    <span className="font-mono text-xs text-cp-accent2">
                      {item.durationMinutes || item.minutos} min
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-cp-muted">
                    <span className="rounded-full border border-cp-border px-2 py-0.5 capitalize">
                      {item.modalidade || 'teoria'}
                    </span>
                    {typeof item.acertos === 'number' || typeof item.erros === 'number' ? (
                      <span>
                        {item.acertos || 0} acertos · {item.erros || 0} erros
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            {sessions.length === 0 && manualEntries.length === 0 && (
              <p className="text-sm text-cp-muted">Nenhum bloco salvo ainda.</p>
            )}
          </div>
        </div>
      </div>

      <StudyTimeChart userId={user?.uid} />

      <div className="cp-card p-5">
        <div className="flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-cp-success" />
          <h2 className="text-base font-semibold text-cp-text">Sincronização em nuvem</h2>
        </div>
        <p className="mt-2 text-sm text-cp-muted">
          Os blocos salvos na Trilha ficam vinculados ao seu usuário e ao curso ativo, para continuar no celular,
          tablet ou computador.
        </p>
      </div>
    </div>
  )
}
