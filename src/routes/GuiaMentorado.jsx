import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot, getDoc, collection, getDocs, setDoc, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import {
  CalendarIcon,
  PencilIcon,
  XMarkIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import { hasPurchasedCourse } from '../utils/courseAccess'
import MentoradoCalendar from '../components/guiaMentorado/MentoradoCalendar'
import MentoradoDayAutomationStatus from '../components/guiaMentorado/MentoradoDayAutomationStatus'
import { DEFAULT_PLANNING_DAYS, MENTORADO_DAILY_RELEASE_HOUR } from '../constants/guiaMentorado'
import {
  isUsingDefaultPlanningWindow,
  resolvePlanningEndDate,
  startGuiaMentoradoCronogramaGeneration,
  startMentoradoDayContentAutomation,
} from '../services/guiaMentoradoAutomationService'

const GuiaMentorado = () => {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  
  const [currentMonth, setCurrentMonth] = useState(dayjs())
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [courses, setCourses] = useState([])
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [cronograma, setCronograma] = useState(null)
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
  const [message, setMessage] = useState('')
  const dailyReleaseLabel =
    MENTORADO_DAILY_RELEASE_HOUR === 0 ? '00:00 (meia-noite)' : `${MENTORADO_DAILY_RELEASE_HOUR}h`
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  // Carregar cursos (apenas relevantes para o usuário)
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
              (c) =>
                c.id === 'alego-default' ||
                hasPurchasedCourse(profile, c.id) ||
                c.id === profile?.selectedCourseId
            )

        setCourses(visible)

        if (profile?.selectedCourseId && visible.some((c) => c.id === profile.selectedCourseId)) {
          setSelectedCourseId(profile.selectedCourseId)
        } else if (visible.length > 0) {
          setSelectedCourseId(visible[0].id)
        }
      } catch (error) {
        console.error('Erro ao carregar cursos:', error)
      }
    }

    if (profile) loadCourses()
  }, [profile])
  
  // Carregar edital verticalizado
  useEffect(() => {
    if (!selectedCourseId) return

    let cancelled = false
    loadEditalVerticalizado(selectedCourseId)
      .then((data) => {
        if (!cancelled) setEditalVerticalizado(data)
      })
      .catch((error) => {
        console.error('Erro ao carregar edital verticalizado:', error)
      })

    return () => {
      cancelled = true
    }
  }, [selectedCourseId])
  
  // Carregar configuração do cronograma
  useEffect(() => {
    if (!selectedCourseId) return
    
    const loadConfig = async () => {
      try {
        const configRef = doc(db, 'courses', selectedCourseId, 'config', 'guiaMentorado')
        const configDoc = await getDoc(configRef)
        
        if (configDoc.exists()) {
          const data = configDoc.data()
          setConfig({
            dataProva: data.dataProva || null,
            hasTAF: Boolean(data.hasTAF),
            tafExercicios: data.tafExercicios || [],
            hasRedacao: Boolean(data.hasRedacao),
            autoGerarConteudo: Boolean(data.autoGerarConteudo),
          })
        }
      } catch (error) {
        console.error('Erro ao carregar configuração:', error)
      }
    }
    
    loadConfig()
  }, [selectedCourseId])
  
  // Carregar cronograma do mês atual
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
      () => setCalendarLoading(false)
    )

    return () => unsubscribe()
  }, [selectedCourseId, currentMonth])
  
  // Verificar se é admin
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
    [navigate, selectedCourseId]
  )
  
  // Salvar configuração
  const saveConfig = async (newConfig) => {
    try {
      const configRef = doc(db, 'courses', selectedCourseId, 'config', 'guiaMentorado')
      await setDoc(configRef, {
        ...newConfig,
        automationUserId: user?.uid || null,
        updatedAt: serverTimestamp(),
      })
      setConfig(newConfig)
      setShowConfigModal(false)
    } catch (error) {
      console.error('Erro ao salvar configuração:', error)
    }
  }
  
  // Gerar cronograma estratégico com IA (na nuvem)
  const generateCronograma = async () => {
    if (!editalVerticalizado) {
      alert('É necessário ter um edital verticalizado para gerar o cronograma.')
      return
    }

    if (!user?.uid) {
      alert('Faça login como administrador para gerar o cronograma.')
      return
    }

    const planningEnd = resolvePlanningEndDate(config)
    const today = dayjs().startOf('day')
    const daysUntilProva = planningEnd.diff(today, 'day')

    if (daysUntilProva <= 0) {
      alert('O período de planejamento deve ser no futuro.')
      return
    }

    const usingDefaultWindow = isUsingDefaultPlanningWindow(config)

    setGenerating(true)

    try {
      setMessage(
        usingDefaultWindow
          ? `🤖 Gerando cronograma na nuvem (${DEFAULT_PLANNING_DAYS} dias)… Pode fechar o site.`
          : '🤖 Gerando cronograma na nuvem… Pode fechar o site.',
      )

      await startGuiaMentoradoCronogramaGeneration({
        userId: user.uid,
        courseId: selectedCourseId,
        config,
      })

      setMessage(
        config.autoGerarConteudo
          ? `✅ Cronograma em geração na nuvem. Hoje libera os tópicos do dia; demais dias às ${dailyReleaseLabel}. Acompanhe o banner.`
          : '✅ Cronograma em geração na nuvem. Acompanhe o banner no canto inferior direito.',
      )

      setTimeout(() => setMessage(''), 10000)
    } catch (error) {
      console.error('Erro ao gerar cronograma:', error)
      alert('Erro ao gerar cronograma: ' + error.message)
      setMessage('')
    } finally {
      setGenerating(false)
    }
  }

  const generateTodayContents = async () => {
    if (!user?.uid) {
      alert('Faça login como administrador.')
      return
    }
    if (!editalVerticalizado) {
      alert('Edital verticalizado não carregado.')
      return
    }

    setGeneratingDay(true)
    try {
      const { topicCount } = await startMentoradoDayContentAutomation({
        userId: user.uid,
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
                onClick={() => setShowConfigModal(true)}
                className="cp-btn-ghost !text-sm"
              >
                <PencilIcon className="h-4 w-4" />
                Configurar
              </button>
              <button
                onClick={generateCronograma}
                disabled={generating || !editalVerticalizado}
                className="cp-btn-primary !text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SparklesIcon className="h-4 w-4" />
                {generating ? 'Gerando...' : 'Gerar Cronograma'}
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
              {course.name}
            </option>
          ))}
        </select>
      </div>

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

      {isAdmin && config.autoGerarConteudo && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          Automação ativa: gera <strong>um tópico por vez</strong> (flashcards → material → questões → libera).
          Hoje dispara na hora; demais dias às <strong>{dailyReleaseLabel}</strong> (Brasília).
        </div>
      )}

      {isAdmin && config.autoGerarConteudo && cronograma && (
        <MentoradoDayAutomationStatus
          courseId={selectedCourseId}
          targetDate={todayKey}
          userId={user?.uid}
          onGenerateToday={generateTodayContents}
          generating={generatingDay}
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
                <h3 className="cp-headline text-lg text-cp-text">Configurar Guia Mentorado</h3>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="text-cp-muted transition hover:text-cp-text"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              
              <div className="space-y-4">
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

                <div className="rounded-xl border border-cp-border bg-cp-surface/60 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(config.autoGerarConteudo)}
                      onChange={(e) =>
                        setConfig({ ...config, autoGerarConteudo: e.target.checked })
                      }
                      className="mt-1 rounded"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-cp-text">
                        Gerar e liberar conteúdos automaticamente
                      </span>
                      <span className="mt-1 block text-xs text-cp-muted">
                        Para cada dia do cronograma, gera e libera flashcards, material e questões só das matérias
                        daquele dia — às {dailyReleaseLabel} (Brasília). No dia da geração, libera na hora.
                      </span>
                    </span>
                  </label>
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
