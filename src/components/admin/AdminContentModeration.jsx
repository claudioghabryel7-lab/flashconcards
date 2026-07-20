import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import {
  FlagIcon,
  CheckIcon,
  ArrowPathIcon,
  TrashIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../hooks/useAuth'
import {
  resolveContentFlag,
  subscribeActiveFlags,
  subscribeResolvedFlags,
  clearResolvedFlagsHistory,
  reopenFlagForProfessor,
} from '../../services/contentFeedbackService'
import { forceProcessModerationNow } from '../../services/adminOnlineProfessorScheduler'

const STATUS_LABEL = {
  open: { text: 'Aberto', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  in_review: { text: 'Professor IA', className: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30' },
  needs_admin: { text: 'Precisa admin', className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30' },
  resolved: { text: 'Resolvido', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
}

export default function AdminContentModeration() {
  const { user } = useAuth()
  const [tab, setTab] = useState('active')
  const [flags, setFlags] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [forcing, setForcing] = useState(false)

  useEffect(() => {
    const unsubActive = subscribeActiveFlags(
      (rows) => {
        setFlags(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
    const unsubHist = subscribeResolvedFlags(
      (rows) => setHistory(rows),
      () => {},
    )
    return () => {
      unsubActive?.()
      unsubHist?.()
    }
  }, [])

  const handleResolve = async (flag, contentCorrected = true) => {
    if (!flag.courseId) return
    setResolvingId(flag.id)
    try {
      await resolveContentFlag(flag.courseId, flag.id, {
        contentCorrected,
        lastProfessorSummary:
          flag.lastProfessorSummary ||
          (contentCorrected
            ? 'Marcado como corrigido pelo admin.'
            : 'Revisado pelo admin — sem alteração no conteúdo.'),
        resolvedBy: 'admin',
        flagSnapshot: flag,
        notifyUser: true,
      })
    } catch (error) {
      console.error(error)
      alert('Erro ao marcar como resolvido.')
    } finally {
      setResolvingId(null)
    }
  }

  const handleReopen = async (flag) => {
    if (!flag.courseId) return
    setResolvingId(flag.id)
    try {
      await reopenFlagForProfessor(flag.courseId, flag.id)
    } catch (error) {
      alert(error.message || 'Erro ao reabrir.')
    } finally {
      setResolvingId(null)
    }
  }

  const handleClearHistory = async () => {
    if (!history.length) return
    if (!window.confirm(`Limpar ${history.length} item(ns) do histórico de sinalizações?`)) return
    setClearing(true)
    try {
      await clearResolvedFlagsHistory(history)
      setHistory([])
    } catch (error) {
      alert(error.message || 'Erro ao limpar histórico.')
    } finally {
      setClearing(false)
    }
  }

  const handleForceProfessor = async () => {
    if (!user?.uid) {
      alert('Admin não autenticado.')
      return
    }
    setForcing(true)
    try {
      const result = await forceProcessModerationNow(user.uid)
      if (result?.skipped) {
        alert(
          result.reason === 'empty'
            ? 'Nenhuma sinalização aberta na fila do Professor IA.'
            : `Professor não iniciou (${result.reason || 'ocupado'}).`,
        )
      } else {
        alert('Professor IA iniciado — acompanhe o status na Moderação.')
      }
    } catch (error) {
      alert(error?.message || 'Falha ao acionar Professor IA.')
    } finally {
      setForcing(false)
    }
  }

  const typeLabel = (t) => {
    if (t === 'questao') return 'Questão'
    if (t === 'flashcard') return 'Flashcard'
    if (t === 'material' || t === 'conteudo') return 'Material'
    return t || 'Conteúdo'
  }

  const renderFlagCard = (flag, { isHistory = false } = {}) => {
    const when = flag.createdAt?.toDate?.()
      ? dayjs(flag.createdAt.toDate()).format('DD/MM/YYYY HH:mm')
      : ''
    const resolvedWhen = flag.resolvedAt?.toDate?.()
      ? dayjs(flag.resolvedAt.toDate()).format('DD/MM/YYYY HH:mm')
      : ''
    const st = STATUS_LABEL[flag.status] || STATUS_LABEL.open

    return (
      <div key={`${flag.courseId}:${flag.id}`} className="cp-card !rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <span className="cp-badge cp-badge-accent !text-[10px]">{typeLabel(flag.contentType)}</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${st.className}`}>
              {st.text}
            </span>
            <span className="cp-badge !text-[10px]">Curso: {flag.courseId || '—'}</span>
            {(flag.disciplinaNome || flag.topicoNome) && (
              <span className="cp-badge cp-badge-cyan !text-[10px] max-w-[240px] truncate">
                {[flag.disciplinaNome, flag.topicoNome].filter(Boolean).join(' — ')}
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] text-cp-muted">{when}</span>
        </div>

        {flag.preview && (
          <p className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-sm text-cp-text">
            {flag.preview}
          </p>
        )}

        <p className="text-sm text-cp-muted">
          <span className="font-medium text-cp-text">{flag.userName || 'Aluno'}:</span>{' '}
          {flag.text || 'Sem descrição'}
        </p>

        {flag.lastProfessorSummary && (
          <div className="rounded-xl border border-cp-accent/20 bg-cp-accent/5 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-cp-accent">Professor IA</p>
            <p className="mt-1 text-sm text-cp-text">{flag.lastProfessorSummary}</p>
            {typeof flag.contentCorrected === 'boolean' && (
              <p className="mt-1 text-xs text-cp-muted">
                {flag.contentCorrected ? 'Conteúdo alterado' : 'Conteúdo mantido (sem alteração)'}
              </p>
            )}
          </div>
        )}

        {isHistory && resolvedWhen && (
          <p className="flex items-center gap-1 font-mono text-[10px] text-cp-muted">
            <ClockIcon className="h-3 w-3" />
            Resolvido {resolvedWhen}
            {flag.resolvedBy ? ` · ${flag.resolvedBy}` : ''}
          </p>
        )}

        {!isHistory && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleResolve(flag, true)}
              disabled={resolvingId === flag.id || !flag.courseId}
              className="cp-btn-primary !text-xs"
            >
              <CheckIcon className="h-4 w-4" />
              {resolvingId === flag.id ? 'Salvando…' : 'Resolver (corrigido)'}
            </button>
            <button
              type="button"
              onClick={() => handleResolve(flag, false)}
              disabled={resolvingId === flag.id || !flag.courseId}
              className="cp-btn-ghost !text-xs"
            >
              Resolver (sem alteração)
            </button>
            {(flag.status === 'needs_admin' || flag.status === 'in_review') && (
              <button
                type="button"
                onClick={() => handleReopen(flag)}
                disabled={resolvingId === flag.id}
                className="cp-btn-ghost !text-xs"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Reabrir p/ Professor
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const list = tab === 'active' ? flags : history

  return (
    <div className="space-y-6">
      <div className="cp-card !rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--cp-accent-4)]/30 bg-[var(--cp-accent-4)]/10">
              <FlagIcon className="h-5 w-5 text-[var(--cp-accent-4)]" />
            </div>
            <div>
              <h2 className="cp-headline text-lg text-cp-text">Conteúdos sinalizados</h2>
              <p className="text-sm text-cp-muted">
                Pendentes ficam aqui até o Professor IA / admin resolver. Resolvidos vão ao histórico.
              </p>
            </div>
          </div>
          {tab === 'active' && (
            <button
              type="button"
              onClick={handleForceProfessor}
              disabled={forcing}
              className="cp-btn-primary !text-xs"
            >
              <ArrowPathIcon className={`h-4 w-4 ${forcing ? 'animate-spin' : ''}`} />
              {forcing ? 'Acionando…' : 'Corrigir Moderação agora'}
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`rounded-full border px-3 py-1.5 font-mono text-[11px] transition ${
              tab === 'active'
                ? 'border-cp-accent/40 bg-cp-accent/15 text-cp-accent'
                : 'border-cp-border text-cp-muted hover:text-cp-text'
            }`}
          >
            Ativos ({flags.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`rounded-full border px-3 py-1.5 font-mono text-[11px] transition ${
              tab === 'history'
                ? 'border-cp-accent/40 bg-cp-accent/15 text-cp-accent'
                : 'border-cp-border text-cp-muted hover:text-cp-text'
            }`}
          >
            Histórico ({history.length})
          </button>
          {tab === 'history' && history.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={clearing}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-rose-500/30 px-3 py-1.5 font-mono text-[11px] text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {clearing ? 'Limpando…' : 'Limpar histórico'}
            </button>
          )}
        </div>
      </div>

      {loading && tab === 'active' ? (
        <p className="py-12 text-center text-sm text-cp-muted">Carregando sinalizações…</p>
      ) : list.length === 0 ? (
        <div className="cp-card py-12 text-center text-sm text-cp-muted">
          {tab === 'active'
            ? 'Nenhuma sinalização pendente.'
            : 'Histórico vazio.'}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((flag) => renderFlagCard(flag, { isHistory: tab === 'history' }))}
        </div>
      )}
    </div>
  )
}
