import { useCallback, useEffect, useState } from 'react'
import {
  ArrowPathIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  RocketLaunchIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../hooks/useAuth'
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  deleteAllTopicContentAllCourses,
  readPlatformSettings,
  setMaintenanceMode,
  startMentoradoBackfillAllCourses,
} from '../../services/adminPlatformService'

export default function AdminPlatformMaintenance() {
  const { user } = useAuth()
  const [maintenanceOn, setMaintenanceOn] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [togglingStandby, setTogglingStandby] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [feedback, setFeedback] = useState('')

  const refreshSettings = useCallback(async () => {
    try {
      const data = await readPlatformSettings()
      setMaintenanceOn(Boolean(data.maintenanceMode))
    } catch (err) {
      console.warn('platform settings:', err.message)
    } finally {
      setLoadingSettings(false)
    }
  }, [])

  useEffect(() => {
    refreshSettings()
  }, [refreshSettings])

  const handleToggleStandby = async () => {
    if (togglingStandby) return

    const next = !maintenanceOn
    const confirmMsg = next
      ? 'Ativar modo standby?\n\nTodos os usuários que NÃO são admin verão a mensagem de manutenção até você desativar.'
      : 'Desativar modo standby?\n\nO site voltará ao normal para todos os usuários.'

    if (!window.confirm(confirmMsg)) return

    setTogglingStandby(true)
    setFeedback('')
    try {
      await setMaintenanceMode(next, DEFAULT_MAINTENANCE_MESSAGE)
      setMaintenanceOn(next)
      setFeedback(next ? '✅ Standby ativado.' : '✅ Standby desativado — site liberado.')
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao alterar standby.'}`)
    } finally {
      setTogglingStandby(false)
    }
  }

  const handleDeleteAllContent = async () => {
    if (deleting) return

    const confirmed = window.confirm(
      '⚠️ ATENÇÃO: Isso vai apagar TODOS os conteúdos gerados dos tópicos de TODOS os cursos:\n\n• Flashcards\n• Materiais (conteúdos completos)\n• Questões por tópico\n• Status de publicação dos tópicos\n\nEsta ação NÃO pode ser desfeita. Continuar?',
    )
    if (!confirmed) return

    setDeleting(true)
    setFeedback('')
    setProgress('Iniciando…')

    try {
      const result = await deleteAllTopicContentAllCourses(setProgress)
      setFeedback(
        `✅ Concluído! ${result.totalDeleted} item(ns) apagado(s) em ${result.courses} curso(s).`,
      )
      setProgress('')
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao apagar conteúdos.'}`)
      setProgress('')
    } finally {
      setDeleting(false)
    }
  }

  const handleGenerateAllMentorado = async () => {
    if (generating || !user?.uid) return

    const confirmed = window.confirm(
      'Gerar todos os tópicos do Guia Mentorado (do primeiro dia até hoje) em TODOS os cursos com automação ativa?\n\nCada curso receberá um job na nuvem — pode levar horas. Acompanhe no banner de geração.',
    )
    if (!confirmed) return

    setGenerating(true)
    setFeedback('')
    setProgress('Preparando jobs…')

    try {
      const { jobs } = await startMentoradoBackfillAllCourses(user.uid, setProgress)
      setFeedback(
        `✅ ${jobs.length} job(s) iniciado(s) na nuvem. Dias: ${jobs.map((j) => `${j.courseName} (${j.dayCount})`).join(', ')}`,
      )
      setProgress('')
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao iniciar geração.'}`)
      setProgress('')
    } finally {
      setGenerating(false)
    }
  }

  const busy = deleting || generating || togglingStandby

  return (
    <div className="rounded-2xl border-2 border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 p-6 shadow-lg dark:border-rose-800 dark:from-rose-900/20 dark:to-orange-900/10">
      <div className="mb-4">
        <p className="mb-1 flex items-center gap-2 text-sm font-bold text-rose-800 dark:text-rose-300">
          <ArrowPathIcon className="h-5 w-5" />
          Manutenção da plataforma
        </p>
        <p className="max-w-3xl text-xs text-rose-900/80 dark:text-rose-200/80">
          Ações em massa para todos os cursos. O Professor IA continua revisando apenas conteúdos
          sinalizados pelos alunos.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDeleteAllContent}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:from-red-700 hover:to-red-800 disabled:opacity-50"
        >
          <TrashIcon className={`h-5 w-5 ${deleting ? 'animate-pulse' : ''}`} />
          {deleting ? 'Apagando…' : 'Apagar conteúdos dos tópicos'}
        </button>

        <button
          type="button"
          onClick={handleGenerateAllMentorado}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
        >
          <RocketLaunchIcon className={`h-5 w-5 ${generating ? 'animate-pulse' : ''}`} />
          {generating ? 'Iniciando…' : 'Gerar Guia Mentorado (dia 1 → hoje)'}
        </button>

        <button
          type="button"
          onClick={handleToggleStandby}
          disabled={busy || loadingSettings}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-lg transition disabled:opacity-50 ${
            maintenanceOn
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
              : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'
          }`}
        >
          {maintenanceOn ? (
            <PlayCircleIcon className="h-5 w-5" />
          ) : (
            <PauseCircleIcon className="h-5 w-5" />
          )}
          {togglingStandby
            ? 'Alterando…'
            : maintenanceOn
              ? 'Desativar standby'
              : 'Standby (manutenção)'}
        </button>
      </div>

      {maintenanceOn && (
        <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          ⚠️ Standby ativo — usuários não-admin veem: &quot;{DEFAULT_MAINTENANCE_MESSAGE}&quot;
        </p>
      )}

      {progress && (
        <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {progress}
        </p>
      )}

      {feedback && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            feedback.startsWith('✅')
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-rose-100 text-rose-800'
          }`}
        >
          {feedback}
        </p>
      )}
    </div>
  )
}
