import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeftIcon,
  BoltIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import {
  buildModoIaQuery,
  fetchAdminModoIaDossier,
} from '../services/googleAiWebDossierService'
import { runMentoradoToday } from '../services/guiaMentoradoAdminService'

/**
 * App interno do admin: grounding estilo Modo IA sem baixar nada.
 * Rota: /admin/modo-ia
 */
export default function AdminModoIaApp() {
  const { user, profile, isAdmin } = useAuth()
  const courseId = profile?.selectedCourseId || ''
  const [disciplina, setDisciplina] = useState('')
  const [topico, setTopico] = useState('')
  const [status, setStatus] = useState('')
  const [dossier, setDossier] = useState('')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [genBusy, setGenBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  const meta = useMemo(
    () => ({
      courseId,
      disciplina,
      topicoNome: topico,
      topicKey: topico,
      banca: profile?.banca || '',
      cargo: profile?.cargo || '',
      concursoName: profile?.competition || profile?.selectedCourseName || '',
    }),
    [courseId, disciplina, topico, profile],
  )

  const previewQuery = buildModoIaQuery(meta)

  if (!isAdmin) {
    return (
      <div className="cp-legacy-root p-6">
        <p className="text-sm text-cp-muted">Acesso restrito a administradores.</p>
      </div>
    )
  }

  const handleResearch = async () => {
    if (!topico.trim()) {
      setFeedback('Informe o tópico.')
      return
    }
    setBusy(true)
    setFeedback('')
    setDossier('')
    setSource('')
    try {
      const result = await fetchAdminModoIaDossier(meta, {
        forceFresh: true,
        onStatus: setStatus,
      })
      setDossier(result.text)
      setSource(result.source)
      setStatus('Dossiê pronto.')
      setFeedback('✅ Dossiê factual montado automaticamente.')
    } catch (error) {
      setFeedback(`❌ ${error?.message || 'Falha na pesquisa.'}`)
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  const handleGenerateToday = async () => {
    if (!user?.uid || !courseId) {
      setFeedback('Selecione um curso no perfil antes.')
      return
    }
    setGenBusy(true)
    setFeedback('')
    try {
      const todayKey = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo',
      })
      setStatus('Gerando conteúdos de hoje com grounding automático…')
      const { topicCount, promise } = await runMentoradoToday({
        userId: user.uid,
        courseId,
        targetDate: todayKey,
      })
      setFeedback(`🚀 Gerando ${topicCount} tópico(s). Mantenha esta aba aberta.`)
      await promise
      setFeedback(`✅ Conteúdos de hoje concluídos (${topicCount} tópico(s)).`)
      setStatus('')
    } catch (error) {
      setFeedback(`❌ ${error?.message || 'Falha ao gerar.'}`)
      setStatus('')
    } finally {
      setGenBusy(false)
    }
  }

  return (
    <div className="cp-legacy-root space-y-6 pb-10">
      <CPPageHeader
        badge="Admin · App interno"
        title="Modo IA (grounding)"
        subtitle="Pesquisa automática no Google pelo seu navegador — sem baixar app nem extensão. Só admin."
        backHref="/admin?tab=guia-mentorado"
        backLabel="Guia Mentorado"
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          to="/admin?tab=guia-mentorado"
          className="inline-flex items-center gap-1 rounded-lg border border-cp-border px-2.5 py-1.5 text-cp-muted hover:text-cp-text"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Voltar ao Guia Mentorado
        </Link>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-semibold uppercase text-emerald-700 dark:text-emerald-300">
          Sem download
        </span>
      </div>

      <div className="cp-card space-y-4 !rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-cp-text">Como funciona</h2>
            <p className="mt-1 text-sm text-cp-muted">
              1) Consulta o Google (Modo IA / busca) pelo seu IP · 2) Extrai o dossiê · 3) Gera
              material, questões e flashcards. Se o Google bloquear bots, usa Gemini Search como
              reserva — tudo automático nesta rota.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={genBusy || !courseId}
          onClick={handleGenerateToday}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
        >
          <BoltIcon className={`h-5 w-5 ${genBusy ? 'animate-pulse' : ''}`} />
          {genBusy ? 'Gerando hoje…' : 'Gerar conteúdos de hoje (automático)'}
        </button>
      </div>

      <div className="cp-card space-y-4 !rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-cp-text">Testar dossiê de um tópico</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-cp-muted">
            Disciplina
            <input
              value={disciplina}
              onChange={(e) => setDisciplina(e.target.value)}
              className="mt-1 w-full rounded-xl border border-cp-border bg-cp-bg px-3 py-2 text-sm text-cp-text"
              placeholder="Ex.: Direito Constitucional"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-cp-muted">
            Tópico
            <input
              value={topico}
              onChange={(e) => setTopico(e.target.value)}
              className="mt-1 w-full rounded-xl border border-cp-border bg-cp-bg px-3 py-2 text-sm text-cp-text"
              placeholder="Ex.: Hierarquia e disciplina PM/AL"
            />
          </label>
        </div>
        <p className="rounded-lg border border-cp-border bg-cp-surface/50 px-3 py-2 font-mono text-[11px] text-cp-muted">
          Query: {previewQuery || '—'}
        </p>
        <button
          type="button"
          disabled={busy || !topico.trim()}
          onClick={handleResearch}
          className="inline-flex items-center gap-2 rounded-xl border border-cp-border px-4 py-2.5 text-sm font-semibold text-cp-text transition hover:bg-cp-surface disabled:opacity-50"
        >
          <MagnifyingGlassIcon className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />
          {busy ? 'Pesquisando…' : 'Montar dossiê agora'}
        </button>

        {status ? <p className="text-xs text-cp-muted">{status}</p> : null}
        {feedback ? <p className="text-sm text-cp-text">{feedback}</p> : null}

        {dossier ? (
          <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              <CheckCircleIcon className="h-4 w-4" />
              Dossiê ({source || 'ok'})
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-cp-text">
              {dossier}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  )
}
