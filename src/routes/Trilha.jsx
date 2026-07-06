import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import {
  BellIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  FireIcon,
  PencilSquareIcon,
  PlayIcon,
  PlusIcon,
  PauseIcon,
  StopIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { useTrilhaLiquidTimer } from '../hooks/useTrilhaLiquidTimer'
import {
  useTrilhaEditalOptions,
  TRILHA_MODALIDADES,
  TRILHA_MODALIDADE_LABELS,
} from '../hooks/useTrilhaEditalOptions'
import { db } from '../firebase/config'
import { formatDuration } from '../utils/trilhaTimerPersistence'
import StudyTimeChart from '../components/StudyTimeChart'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import toast from 'react-hot-toast'
import { saveManualEntry, saveTimerSession, firestoreErrorMessage } from '../services/trilhaSaveService'
import {
  clearTrilhaHistory,
  deleteTrilhaManualEntry,
  deleteTrilhaSession,
  subscribeTrilhaManualEntries,
  subscribeTrilhaSessions,
} from '../services/trilhaStorage'

const DEFAULT_FORM = {
  materia: '',
  assunto: '',
  modalidade: 'teoria',
  minutos: 30,
  acertos: 0,
  erros: 0,
}

const REPORT_MODALITIES = ['teoria', 'questoes', 'flashcards']

function normalizeModalidade(value) {
  const v = (value || 'teoria').toLowerCase()
  if (v === 'exercicios' || v === 'exercício' || v === 'exercicio') return 'questoes'
  if (v === 'revisao' || v === 'lei-seca') return 'teoria'
  if (REPORT_MODALITIES.includes(v)) return v
  return 'teoria'
}

function TrilhaMateriaFields({ form, onChange, materias, topicosByMateria, editalLoading }) {
  const topicos = form.materia ? topicosByMateria[form.materia] || [] : []

  return (
    <>
      <label className="text-sm text-cp-muted">
        Matéria
        <select
          value={form.materia}
          onChange={(e) => onChange({ materia: e.target.value, assunto: '' })}
          className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
          disabled={editalLoading}
        >
          <option value="">{editalLoading ? 'Carregando edital...' : 'Selecione a matéria'}</option>
          {materias.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-cp-muted">
        Tópico
        <select
          value={form.assunto}
          onChange={(e) => onChange({ assunto: e.target.value })}
          className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
          disabled={!form.materia || topicos.length === 0}
        >
          <option value="">
            {!form.materia
              ? 'Selecione a matéria primeiro'
              : topicos.length === 0
                ? 'Nenhum tópico no edital'
                : 'Selecione o tópico'}
          </option>
          {topicos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-cp-muted">
        Modalidade
        <select
          value={form.modalidade}
          onChange={(e) => onChange({ modalidade: e.target.value })}
          className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
        >
          {TRILHA_MODALIDADES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
    </>
  )
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
  const { materias, topicosByMateria, loading: editalLoading } = useTrilhaEditalOptions(courseId)

  const {
    timerActive,
    timerPaused,
    elapsedSeconds,
    alarmMinutes,
    alarmTriggered,
    timerForm,
    timerState,
    setTimerForm,
    setAlarmMinutes,
    handleStart,
    handlePause,
    clearTimer,
  } = useTrilhaLiquidTimer(user?.uid, courseId, { onAlarm: playAlarm })

  const [manualForm, setManualForm] = useState(DEFAULT_FORM)
  const [sessions, setSessions] = useState([])
  const [manualEntries, setManualEntries] = useState([])
  const [questionStats, setQuestionStats] = useState({ total: 0, correct: 0, wrong: 0 })
  const [savingSession, setSavingSession] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)

  useEffect(() => {
    if (!user?.uid) return () => {}

    const unsubSessions = subscribeTrilhaSessions(user.uid, setSessions)
    const unsubManual = subscribeTrilhaManualEntries(user.uid, setManualEntries)

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
      unsubSessions()
      unsubManual()
    }
  }, [courseId, user?.uid])

  const courseRows = useMemo(() => {
    const matchCourse = (row) => !courseId || !row.courseId || row.courseId === courseId
    return [...sessions, ...manualEntries].filter(matchCourse)
  }, [sessions, manualEntries, courseId])

  const totalHours = useMemo(
    () =>
      courseRows.reduce(
        (sum, item) => sum + (item.durationMinutes || item.minutos || 0) / 60,
        0,
      ),
    [courseRows],
  )

  const categoryBreakdown = useMemo(() => {
    const totals = { teoria: 0, questoes: 0, flashcards: 0 }
    courseRows.forEach((item) => {
      const key = normalizeModalidade(item.modalidade)
      const minutes = item.durationMinutes || item.minutos || 0
      totals[key] = (totals[key] || 0) + minutes
    })
    return REPORT_MODALITIES.map((key) => ({
      name: key,
      label: TRILHA_MODALIDADE_LABELS[key],
      minutes: totals[key] || 0,
    }))
  }, [courseRows])

  const recentHistory = useMemo(
    () =>
      [...sessions, ...manualEntries]
        .filter((row) => !courseId || !row.courseId || row.courseId === courseId)
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        .slice(0, 8),
    [sessions, manualEntries, courseId],
  )

  const handleStop = async () => {
    if (!user?.uid || elapsedSeconds <= 0) {
      clearTimer()
      return
    }

    if (!timerForm.materia?.trim()) {
      toast.error('Selecione a matéria antes de encerrar e salvar.')
      return
    }

    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60))
    const sessionCourseId = timerState?.courseId ?? courseId
    setSavingSession(true)
    try {
      await saveTimerSession({
        user,
        profile,
        courseId: sessionCourseId,
        timerForm,
        durationMinutes,
        elapsedSeconds,
      })
      toast.success('Sessão salva!')
      clearTimer()
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
    if (!user?.uid || !manualForm.materia || !manualForm.minutos) {
      toast.error('Preencha matéria e minutos.')
      return
    }

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

  const handleDeleteHistoryItem = async (item) => {
    if (!user?.uid) return
    if (!window.confirm('Remover este registro do histórico?')) return
    try {
      if (item.durationMinutes != null && !item.minutos) {
        await deleteTrilhaSession(user.uid, item.id)
      } else {
        await deleteTrilhaManualEntry(user.uid, item.id)
      }
      toast.success('Registro removido.')
    } catch {
      toast.error('Erro ao remover registro.')
    }
  }

  const handleClearHistory = async () => {
    if (!user?.uid) return
    if (!window.confirm('Limpar todo o histórico da Trilha? Essa ação não pode ser desfeita.')) return
    setClearingHistory(true)
    try {
      await clearTrilhaHistory(user.uid)
      toast.success('Histórico limpo.')
    } catch {
      toast.error('Erro ao limpar histórico.')
    } finally {
      setClearingHistory(false)
    }
  }

  return (
    <div className="space-y-8 pb-10">
      <CPPageHeader
        badge="Trilha"
        title="Trilha de estudo"
        subtitle="Cronômetro, lançamentos manuais e visão consolidada do seu desempenho por matéria e modalidade."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="cp-card p-5">
          <p className="text-xs text-cp-muted">Horas registradas</p>
          <p className="mt-2 text-2xl font-semibold text-cp-text">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="cp-card p-5">
          <p className="text-xs text-cp-muted">Blocos salvos</p>
          <p className="mt-2 text-2xl font-semibold text-cp-text">{courseRows.length}</p>
        </div>
        <div className="cp-card p-5">
          <p className="text-xs text-cp-muted">Questões resolvidas</p>
          <p className="mt-2 text-2xl font-semibold text-cp-text">{questionStats.total}</p>
          <p className="mt-1 text-xs text-cp-muted">
            {questionStats.correct} acertos · {questionStats.wrong} erros
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="cp-card p-6">
          <div className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-cp-accent" />
            <h2 className="text-lg font-semibold text-cp-text">Cronômetro de horas</h2>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <TrilhaMateriaFields
              form={timerForm}
              onChange={(patch) => setTimerForm((c) => ({ ...c, ...patch }))}
              materias={materias}
              topicosByMateria={topicosByMateria}
              editalLoading={editalLoading}
            />
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

        <div className="cp-card p-6">
          <div className="flex items-center gap-2">
            <PencilSquareIcon className="h-5 w-5 text-cp-accent2" />
            <h2 className="text-lg font-semibold text-cp-text">Registro manual</h2>
          </div>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <TrilhaMateriaFields
                form={manualForm}
                onChange={(patch) => setManualForm((c) => ({ ...c, ...patch }))}
                materias={materias}
                topicosByMateria={topicosByMateria}
                editalLoading={editalLoading}
              />
            </div>
            <input
              type="number"
              min="1"
              value={manualForm.minutos}
              onChange={(e) => setManualForm((c) => ({ ...c, minutos: Number(e.target.value) || 0 }))}
              className="rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
              placeholder="Minutos"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min="0"
                value={manualForm.acertos}
                onChange={(e) => setManualForm((c) => ({ ...c, acertos: Number(e.target.value) || 0 }))}
                className="rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
                placeholder="Acertos"
              />
              <input
                type="number"
                min="0"
                value={manualForm.erros}
                onChange={(e) => setManualForm((c) => ({ ...c, erros: Number(e.target.value) || 0 }))}
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
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="cp-card p-6">
          <div className="flex items-center gap-2">
            <ChartBarIcon className="h-5 w-5 text-cp-accent2" />
            <h2 className="text-lg font-semibold text-cp-text">Relatórios</h2>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-cp-border bg-cp-surface p-4">
              <p className="text-xs text-cp-muted">Tempo por modalidade (seus dados)</p>
              <div className="mt-3 space-y-2">
                {categoryBreakdown.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-cp-text">{item.label}</span>
                    <span className="font-mono text-cp-muted">{item.minutes} min</span>
                  </div>
                ))}
                {courseRows.length === 0 && (
                  <p className="text-sm text-cp-muted">Sem dados ainda.</p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-cp-border bg-cp-surface p-4">
              <p className="text-xs text-cp-muted">Aproveitamento em questões</p>
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FireIcon className="h-5 w-5 text-cp-accent2" />
              <h2 className="text-lg font-semibold text-cp-text">Histórico recente</h2>
            </div>
            {recentHistory.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                disabled={clearingHistory}
                className="text-xs font-medium text-rose-500 hover:text-rose-400 disabled:opacity-50"
              >
                {clearingHistory ? 'Limpando...' : 'Limpar tudo'}
              </button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {recentHistory.map((item) => (
              <div key={item.id} className="rounded-2xl border border-cp-border bg-cp-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-cp-text">{item.materia || 'Sem matéria'}</p>
                    <p className="text-sm text-cp-muted">{item.assunto || 'Sem tópico'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-cp-accent2">
                      {item.durationMinutes || item.minutos} min
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteHistoryItem(item)}
                      className="rounded-lg p-1 text-cp-muted hover:text-rose-500"
                      aria-label="Remover"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-cp-muted">
                  <span className="rounded-full border border-cp-border px-2 py-0.5">
                    {TRILHA_MODALIDADE_LABELS[normalizeModalidade(item.modalidade)] || item.modalidade}
                  </span>
                  {typeof item.acertos === 'number' || typeof item.erros === 'number' ? (
                    <span>
                      {item.acertos || 0} acertos · {item.erros || 0} erros
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            {recentHistory.length === 0 && (
              <p className="text-sm text-cp-muted">Nenhum bloco salvo ainda.</p>
            )}
          </div>
        </div>
      </div>

      <StudyTimeChart userId={user?.uid} courseId={courseId} />

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
