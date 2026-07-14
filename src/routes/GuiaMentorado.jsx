import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot, collection, getDocs, setDoc, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import {
  CalendarIcon,
  PencilIcon,
  XMarkIcon,
  SparklesIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import { auth, db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import { hasPurchasedCourse } from '../utils/courseAccess'
import MentoradoCalendar from '../components/guiaMentorado/MentoradoCalendar'
import MentoradoDayAutomationStatus from '../components/guiaMentorado/MentoradoDayAutomationStatus'
import { DEFAULT_PLANNING_DAYS } from '../constants/guiaMentorado'
import {
  isUsingDefaultPlanningWindow,
  resolvePlanningEndDate,
  startGuiaMentoradoCronogramaGeneration,
  startMentoradoDayContentAutomation,
} from '../services/guiaMentoradoAutomationService'
import { startMentoradoBackfillForCourse } from '../services/adminPlatformService'
import {
  formatDailyReleaseLabel,
  normalizeMentoradoAutomationConfig,
  buildMentoradoConfigWrite,
} from '../utils/guiaMentoradoAutomationConfig'

function hasUsableEdital(edital) {
  return Array.isArray(edital?.disciplinas) && edital.disciplinas.length > 0
}

const GuiaMentorado = () => {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid || auth?.currentUser?.uid || ''

  const [currentMonth, setCurrentMonth] = useState(dayjs())
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [courses, setCourses] = useState([])
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [editalLoading, setEditalLoading] = useState(false)
  const [editalError, setEditalError] = useState('')
  const [cronograma, setCronograma] = useState(null)
  const [rawConfig, setRawConfig] = useState({})
  const [config, setConfig] = useState({
    dataProva: null,
    hasTAF: false,
    tafExercicios: [],
    hasRedacao: false,
    autoGerarConteudo: false,
  })
  const [isAdmin, setIsAdmin] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatingDay, setGeneratingDay] = useState(false)
  const [generatingPastDays, setGeneratingPastDays] = useState(false)
  const [message, setMessage] = useState('')

  const automation = useMemo(
    () => normalizeMentoradoAutomationConfig(rawConfig),
    [rawConfig],
  )
  const dailyReleaseLabel = formatDailyReleaseLabel(automation)
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const editalReady = hasUsableEdital(editalVerticalizado)

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const coursesSnapshot = await getDocs(coursesRef)
        const coursesList = coursesSnapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c) => c.active !== false)

        const isAdminUser = profile?.role === 'admin'
        const visible = isAdminUser
          ? coursesList
          : coursesList.filter(
              (c) => c.id === 'alego-default' || hasPurchasedCourse(profile, c.id),
            )

        setCourses(visible)

        if (profile?.selectedCourseId && visible.some((c) => c.id === profile.selectedCourseId)) {
          setSelectedCourseId(profile.selectedCourseId)
        } else if (visible.length > 0) {
          setSelectedCourseId((prev) =>
            prev && visible.some((c) => c.id === prev) ? prev : visible[0].id,
          )
        }
      } catch (error) {
        console.error('Erro ao carregar cursos:', error)
      }
    }

    if (profile) loadCourses()
  }, [profile])

  useEffect(() => {
    if (!selectedCourseId) {
      setEditalVerticalizado(null)
      setEditalError('')
      setEditalLoading(false)
      return
    }

    let cancelled = false
    setEditalLoading(true)
    setEditalError('')
    setEditalVerticalizado(null)

    loadEditalVerticalizado(selectedCourseId)
      .then((data) => {
        if (cancelled) return
        setEditalVerticalizado(data)
        if (!hasUsableEdital(data)) {
          setEditalError(
            'Edital verticalizado ausente ou sem disciplinas neste curso. Gere o edital no Admin.',
          )
        }
      })
      .catch((error) => {
        console.error('Erro ao carregar edital verticalizado:', error)
        if (!cancelled) {
          setEditalVerticalizado(null)
          setEditalError(error?.message || 'Falha ao carregar edital verticalizado.')
        }
      })
      .finally(() => {
        if (!cancelled) setEditalLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedCourseId])

  useEffect(() => {
    if (!selectedCourseId || !db) return undefined

    const configRef = doc(db, 'courses', selectedCourseId, 'config', 'guiaMentorado')
    return onSnapshot(
      configRef,
      (configDoc) => {
        const data = configDoc.exists() ? configDoc.data() : {}
        setRawConfig(data)
        const normalized = normalizeMentoradoAutomationConfig(data)
        setConfig({
          dataProva: normalized.dataProva,
          hasTAF: normalized.hasTAF,
          tafExercicios: normalized.tafExercicios,
          hasRedacao: normalized.hasRedacao,
          autoGerarConteudo: normalized.enabled,
        })
      },
      (error) => console.error('Erro ao carregar configuração:', error),
    )
  }, [selectedCourseId])

  useEffect(() => {
    if (!selectedCourseId) return

    setCalendarLoading(true)
    const monthKey = currentMonth.format('YYYY-MM')
    const cronogramaRef = doc(db, 'courses', selectedCourseId, 'cronograma', monthKey)

    const unsubscribe = onSnapshot(
      cronogramaRef,
      (snapshot) => {
        setCronograma(snapshot.exists() ? snapshot.data() : null)
        setCalendarLoading(false)
      },
      () => setCalendarLoading(false),
    )

    return () => unsubscribe()
  }, [selectedCourseId, currentMonth])

  useEffect(() => {
    setIsAdmin(profile?.role === 'admin')
  }, [profile])

  const previousMonth = useCallback(() => {
    setCurrentMonth((m) => m.subtract(1, 'month'))
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentMonth((m) => m.add(1, 'month'))
  }, [])

  const goToToday = useCallback(() => {
    setCurrentMonth(dayjs())
  }, [])

  const handleDayClick = useCallback(
    (dayKey) => {
      navigate(`/guia-mentorado/${selectedCourseId}/${dayKey}`)
    },
    [navigate, selectedCourseId],
  )

  const saveConfig = async (newConfig) => {
    try {
      const configRef = doc(db, 'courses', selectedCourseId, 'config', 'guiaMentorado')
      const payload = buildMentoradoConfigWrite(
        {
          dataProva: newConfig.dataProva,
          hasTAF: newConfig.hasTAF,
          tafExercicios: newConfig.tafExercicios,
          hasRedacao: newConfig.hasRedacao,
          enabled: automation.enabled,
          dailyReleaseHour: automation.schedule.dailyReleaseHour,
          dailyReleaseMinute: automation.schedule.dailyReleaseMinute,
          onCronogramaGenerated: automation.triggers.onCronogramaGenerated,
          onDailyCron: automation.triggers.onDailyCron,
          allowManualDay: automation.triggers.allowManualDay,
          allowBackfill: automation.triggers.allowBackfill,
          releaseOnDayComplete: automation.vespera.releaseOnDayComplete,
        },
        { userId: uid || automation.automationUserId, existing: rawConfig },
      )
      await setDoc(
        configRef,
        {
          ...payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setShowConfigModal(false)
    } catch (error) {
      console.error('Erro ao salvar configuração:', error)
      alert(error?.message || 'Erro ao salvar configuração.')
    }
  }

  const generateCronograma = async () => {
    if (!selectedCourseId) {
      alert('Selecione um curso.')
      return
    }
    if (!uid) {
      alert('Faça login como administrador para gerar o cronograma.')
      return
    }

    setGenerating(true)
    setMessage('🔎 Verificando edital verticalizado…')

    try {
      // Recarrega na hora do clique (evita estado stale / falso “sem edital”)
      const freshEdital = await loadEditalVerticalizado(selectedCourseId)
      setEditalVerticalizado(freshEdital)

      if (!hasUsableEdital(freshEdital)) {
        throw new Error(
          'É necessário ter um edital verticalizado com disciplinas neste curso. Gere o edital no Admin → Edital Verticalizado.',
        )
      }

      const planningEnd = resolvePlanningEndDate(config)
      const today = dayjs().startOf('day')
      const daysUntilProva = planningEnd.diff(today, 'day')

      if (daysUntilProva <= 0) {
        throw new Error('O período de planejamento deve ser no futuro. Ajuste a data da prova em Planejamento.')
      }

      const usingDefaultWindow = isUsingDefaultPlanningWindow(config)

      setMessage(
        usingDefaultWindow
          ? `🤖 Gerando cronograma na nuvem (${DEFAULT_PLANNING_DAYS} dias)… Pode fechar o site.`
          : '🤖 Gerando cronograma na nuvem… Pode fechar o site.',
      )

      const { jobId } = await startGuiaMentoradoCronogramaGeneration({
        userId: uid,
        courseId: selectedCourseId,
        config: {
          ...config,
          autoGerarConteudo: automation.enabled,
          automation: {
            enabled: automation.enabled,
            automationUserId: uid,
            schedule: automation.schedule,
            triggers: automation.triggers,
            vespera: automation.vespera,
          },
          automationUserId: uid,
        },
      })

      setMessage(
        automation.enabled
          ? `✅ Cronograma enfileirado (job ${String(jobId).slice(0, 8)}…). Hoje libera os tópicos do dia; demais dias às ${dailyReleaseLabel}. Acompanhe o banner.`
          : `✅ Cronograma enfileirado (job ${String(jobId).slice(0, 8)}…). Acompanhe o banner no canto inferior direito.`,
      )

      setTimeout(() => setMessage(''), 12000)
    } catch (error) {
      console.error('Erro ao gerar cronograma:', error)
      alert('Erro ao gerar cronograma: ' + (error.message || String(error)))
      setMessage('')
    } finally {
      setGenerating(false)
    }
  }

  const generateTodayContents = async () => {
    if (!uid) {
      alert('Faça login como administrador.')
      return
    }
    if (!editalReady) {
      alert('Edital verticalizado não carregado.')
      return
    }

    setGeneratingDay(true)
    try {
      const { topicCount } = await startMentoradoDayContentAutomation({
        userId: uid,
        courseId: selectedCourseId,
        targetDate: todayKey,
        editalVerticalizado,
      })
      setMessage(`🚀 Gerando ${topicCount} tópico(s) de hoje, um por vez. Acompanhe abaixo e no banner.`)
      setTimeout(() => setMessage(''), 10000)
    } catch (error) {
      console.error('Erro ao gerar conteúdos do dia:', error)
      alert(error.message || 'Erro ao iniciar geração do dia.')
    } finally {
      setGeneratingDay(false)
    }
  }

  const generatePastDaysContents = async () => {
    if (!uid) {
      alert('Faça login como administrador.')
      return
    }
    if (!selectedCourseId) {
      alert('Selecione um curso.')
      return
    }
    if (!editalReady) {
      alert('Edital verticalizado não carregado.')
      return
    }

    const confirmed = window.confirm(
      'Gerar os conteúdos faltantes deste curso (do 1º dia do cronograma até hoje)?\n\nUm único job na nuvem processa dia a dia com retomada automática. Acompanhe no banner.',
    )
    if (!confirmed) return

    setGeneratingPastDays(true)
    try {
      const courseName =
        courses.find((c) => c.id === selectedCourseId)?.name ||
        courses.find((c) => c.id === selectedCourseId)?.competition ||
        selectedCourseId
      const { jobs, dayCount } = await startMentoradoBackfillForCourse({
        userId: uid,
        courseId: selectedCourseId,
        courseName,
        editalVerticalizado,
      })
      setMessage(
        `🚀 Backfill iniciado (${dayCount || jobs.length} dia(s) em 1 job). Acompanhe no banner de geração.`,
      )
      setTimeout(() => setMessage(''), 12000)
    } catch (error) {
      console.error('Erro ao gerar dias passados:', error)
      alert(error.message || 'Erro ao iniciar geração dos dias passados.')
    } finally {
      setGeneratingPastDays(false)
    }
  }

  const cronogramaBtnTitle = editalLoading
    ? 'Carregando edital…'
    : editalReady
      ? 'Gerar cronograma na nuvem'
      : editalError || 'Sem edital verticalizado — o clique verifica de novo e avisa'

  return (
    <div className="space-y-6">
      <CPPageHeader
        badge="Cronograma"
        title="Guia Mentorado"
        subtitle="Cronograma estratégico baseado no edital verticalizado"
        backHref="/dashboard"
        actions={
          isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => navigate('/admin?tab=guia-mentorado')}
                className="cp-btn-ghost !text-sm"
                title="Abrir painel admin — aba Guia Mentorado"
              >
                <Cog6ToothIcon className="h-4 w-4" />
                Automação
              </button>
              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                className="cp-btn-ghost !text-sm"
              >
                <PencilIcon className="h-4 w-4" />
                Planejamento
              </button>
              <button
                type="button"
                onClick={generateCronograma}
                disabled={generating || editalLoading || !selectedCourseId}
                title={cronogramaBtnTitle}
                className="cp-btn-primary !text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SparklesIcon className="h-4 w-4" />
                {generating ? 'Gerando...' : editalLoading ? 'Carregando edital…' : 'Gerar Cronograma'}
              </button>
            </>
          ) : undefined
        }
      />

      {message && (
        <div className="rounded-xl border border-[var(--cp-accent-2)]/30 bg-[var(--cp-accent-2)]/10 px-4 py-3 text-center text-sm text-[var(--cp-accent-2)]">
          {message}
        </div>
      )}

      <div>
        <label className="mb-2 block font-mono text-xs uppercase tracking-wide text-cp-muted">
          Curso
        </label>
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          className="w-full rounded-xl border border-cp-border bg-cp-surface px-4 py-2.5 text-cp-text focus:border-[var(--cp-accent)] focus:outline-none sm:w-72"
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name || course.competition || course.id}
            </option>
          ))}
        </select>
      </div>

      {isAdmin && selectedCourseId && !editalLoading && !editalReady && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {editalError ||
            'Este curso ainda não tem edital verticalizado com disciplinas. Gere o edital no Admin antes do cronograma.'}
        </div>
      )}

      {config.dataProva ? (
        <div className="cp-card flex items-center gap-4 !rounded-2xl p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cp-border bg-cp-surface">
            <CalendarIcon className="h-5 w-5 text-[var(--cp-accent-4)]" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-cp-muted">Data da prova</p>
            <p className="text-cp-text">
              {dayjs(config.dataProva).format('DD/MM/YYYY')}
              {dayjs(config.dataProva).isAfter(dayjs()) && (
                <span className="ml-2 text-[var(--cp-accent-2)]">
                  ({dayjs(config.dataProva).diff(dayjs(), 'day')} dias restantes)
                </span>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="cp-card flex items-center gap-4 !rounded-2xl border-dashed p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cp-border bg-cp-surface">
            <CalendarIcon className="h-5 w-5 text-cp-muted" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-cp-muted">Planejamento padrão</p>
            <p className="text-sm text-cp-text">
              Sem data da prova — o cronograma usará <strong>{DEFAULT_PLANNING_DAYS} dias</strong> a partir de hoje.
            </p>
          </div>
        </div>
      )}

      {isAdmin && automation.enabled && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          Automação ativa: gera <strong>um tópico por vez</strong> (flashcards → material → questões → libera).
          Liberação diária às <strong>{dailyReleaseLabel}</strong> (Brasília). Configure na aba{' '}
          <button
            type="button"
            onClick={() => navigate('/admin?tab=guia-mentorado')}
            className="font-semibold underline underline-offset-2"
          >
            Admin → Guia Mentorado
          </button>
          .
        </div>
      )}

      {isAdmin && automation.enabled && cronograma && (
        <MentoradoDayAutomationStatus
          courseId={selectedCourseId}
          targetDate={todayKey}
          userId={uid}
          onGenerateToday={generateTodayContents}
          onGeneratePastDays={generatePastDaysContents}
          generating={generatingDay}
          generatingPastDays={generatingPastDays}
        />
      )}

      <MentoradoCalendar
        currentMonth={currentMonth}
        cronograma={cronograma}
        examDate={config.dataProva || resolvePlanningEndDate(config).format('YYYY-MM-DD')}
        loading={calendarLoading}
        onPreviousMonth={previousMonth}
        onNextMonth={nextMonth}
        onGoToday={goToToday}
        onDayClick={handleDayClick}
      />

      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="cp-card w-full max-w-md !rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="cp-headline text-lg text-cp-text">Planejamento do Guia Mentorado</h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-cp-muted transition hover:text-cp-text"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-cp-border bg-cp-surface/60 p-3 text-xs text-cp-muted">
                Automação (horário, cron, backfill, véspera) fica em{' '}
                <button
                  type="button"
                  className="font-semibold text-cp-text underline"
                  onClick={() => {
                    setShowConfigModal(false)
                    navigate('/admin?tab=guia-mentorado')
                  }}
                >
                  Admin → Guia Mentorado
                </button>
                .
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-cp-muted">
                  Data da Prova (opcional)
                </label>
                <input
                  type="date"
                  value={config.dataProva || ''}
                  onChange={(e) => setConfig({ ...config, dataProva: e.target.value || null })}
                  className="w-full rounded-lg border border-cp-border bg-cp-surface px-4 py-2 text-cp-text focus:border-[var(--cp-accent)] focus:outline-none"
                />
                <p className="mt-1 text-xs text-cp-muted">
                  Se vazio, o cronograma usa {DEFAULT_PLANNING_DAYS} dias a partir de hoje.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hasTAF"
                  checked={config.hasTAF}
                  onChange={(e) => setConfig({ ...config, hasTAF: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="hasTAF" className="text-sm text-cp-text">
                  Possui TAF (Teste de Aptidão Física)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hasRedacao"
                  checked={config.hasRedacao}
                  onChange={(e) => setConfig({ ...config, hasRedacao: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="hasRedacao" className="text-sm text-cp-text">
                  Possui Redação
                </label>
              </div>

              {config.hasTAF && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-cp-muted">
                    Exercícios do TAF
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Barra', 'Flexão', 'Corrida', 'Abdominal', 'Shut Run', 'Salto'].map((exercicio) => (
                      <label key={exercicio} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.tafExercicios?.includes(exercicio)}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...(config.tafExercicios || []), exercicio]
                              : config.tafExercicios?.filter((ex) => ex !== exercicio) || []
                            setConfig({ ...config, tafExercicios: updated })
                          }}
                          className="rounded"
                        />
                        <span className="text-sm text-cp-text">{exercicio}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowConfigModal(false)}
                className="cp-btn-ghost flex-1 !text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveConfig(config)}
                className="cp-btn-primary flex-1 !text-sm"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GuiaMentorado
