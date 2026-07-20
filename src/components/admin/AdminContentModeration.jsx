import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { FlagIcon, CheckIcon, TrashIcon } from '@heroicons/react/24/outline'
import {
  deleteContentFlag,
  resolveContentFlag,
  subscribeOpenFlags,
} from '../../services/contentFeedbackService'
import { buildFlagCorrectionLink } from '../../utils/flagCorrectionLinks'
import { useAuth } from '../../hooks/useAuth'
import { forceProcessModerationNow } from '../../services/adminOnlineProfessorScheduler'

/**
 * Painel de Moderação — sinalizações dos alunos.
 * Admin resolve/apaga aqui; Professor IA (online) corrige automaticamente as abertas.
 */
export default function AdminContentModeration() {
  const { user } = useAuth()
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [forcing, setForcing] = useState(false)

  useEffect(() => {
    const unsub = subscribeOpenFlags(
      (rows) => {
        setFlags(rows || [])
        setLoading(false)
        setError(null)
      },
      (err) => {
        setLoading(false)
        setError(err?.message || 'Não foi possível carregar as sinalizações.')
      },
    )
    return () => unsub?.()
  }, [])

  const handleResolve = async (flag, contentCorrected = false) => {
    if (!flag.courseId) {
      alert('Sinalização sem courseId — não é possível marcar.')
      return
    }
    setBusyId(flag.id)
    try {
      await resolveContentFlag(flag.courseId, flag.id, { contentCorrected })
    } catch (e) {
      console.error(e)
      alert(e?.message || 'Erro ao marcar como resolvido.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (flag) => {
    if (!flag.courseId) return
    if (!window.confirm('Apagar esta sinalização permanentemente?')) return
    setBusyId(flag.id)
    try {
      await deleteContentFlag(flag.courseId, flag.id)
    } catch (e) {
      console.error(e)
      alert(e?.message || 'Erro ao apagar sinalização.')
    } finally {
      setBusyId(null)
    }
  }

  const handleForceProfessor = async () => {
    if (!user?.uid || forcing) return
    setForcing(true)
    try {
      const result = await forceProcessModerationNow(user.uid)
      if (result?.skipped && result.reason === 'empty') {
        alert('Nenhuma sinalização aberta para corrigir.')
      } else if (result?.started) {
        alert('Professor IA iniciou a correção. Acompanhe em 🎓 Professor IA.')
      }
    } catch (e) {
      console.error(e)
      alert(e?.message || 'Erro ao iniciar Professor IA.')
    } finally {
      setForcing(false)
    }
  }

  const typeLabel = (t) => {
    if (t === 'questao') return 'Questão'
    if (t === 'flashcard') return 'Flashcard'
    if (t === 'material' || t === 'materia') return 'Material'
    if (t === 'incidencia') return 'Incidência'
    return t || 'Conteúdo'
  }

  const statusLabel = (s) => {
    if (s === 'needs_admin') return 'Precisa admin'
    if (s === 'in_review') return 'Em revisão IA'
    return 'Aberta'
  }

  return (
    <div className="space-y-6">
      <div className="cp-card !rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--cp-accent-4)]/30 bg-[var(--cp-accent-4)]/10">
              <FlagIcon className="h-5 w-5 text-[var(--cp-accent-4)]" />
            </div>
            <div>
              <h2 className="cp-headline text-lg text-cp-text">Moderação — Sinalizações</h2>
              <p className="text-sm text-cp-muted">
                Conteúdos reportados pelos alunos. Com o painel admin aberto, o Professor IA corrige
                sozinho (~90s). Você também pode forçar 1 correção agora.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleForceProfessor}
            disabled={forcing || !user?.uid || flags.length === 0}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {forcing ? 'Iniciando…' : 'Corrigir com Professor IA'}
          </button>
        </div>
        <p className="mt-3 text-xs text-cp-muted">
          {loading ? 'Carregando…' : `${flags.length} sinalização(ões) pendente(s)`}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-cp-muted">Carregando sinalizações…</p>
      ) : flags.length === 0 ? (
        <div className="cp-card py-12 text-center text-sm text-cp-muted">
          Nenhuma sinalização pendente.
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => {
            const when = flag.createdAt?.toDate?.()
              ? dayjs(flag.createdAt.toDate()).format('DD/MM/YYYY HH:mm')
              : ''
            const openHref = buildFlagCorrectionLink(flag)
            return (
              <div key={`${flag.courseId}-${flag.id}`} className="cp-card !rounded-2xl space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <span className="cp-badge cp-badge-accent !text-[10px]">
                      {typeLabel(flag.contentType)}
                    </span>
                    <span className="cp-badge !text-[10px]">{statusLabel(flag.status)}</span>
                    <span className="cp-badge !text-[10px]">Curso: {flag.courseId || '—'}</span>
                    {flag.topicKey && (
                      <span className="cp-badge cp-badge-cyan !text-[10px] max-w-[220px] truncate">
                        {(() => {
                          try {
                            return decodeURIComponent(flag.topicKey)
                          } catch {
                            return flag.topicKey
                          }
                        })()}
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
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Professor IA: {flag.lastProfessorSummary}
                    {Number(flag.lastProfessorApplied) > 0
                      ? ` (${flag.lastProfessorApplied} patch(es) aplicado(s))`
                      : ''}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {flag.courseId && (
                    <a
                      href={openHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cp-btn-ghost !text-xs"
                    >
                      Abrir conteúdo
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleResolve(flag, true)}
                    disabled={busyId === flag.id || !flag.courseId}
                    className="cp-btn-primary !text-xs"
                    title="Use só se você já alterou o conteúdo manualmente"
                  >
                    <CheckIcon className="h-4 w-4" />
                    {busyId === flag.id ? 'Salvando…' : 'Conteúdo corrigido'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolve(flag, false)}
                    disabled={busyId === flag.id || !flag.courseId}
                    className="cp-btn-ghost !text-xs"
                    title="Fecha sem afirmar que o conteúdo foi alterado"
                  >
                    {busyId === flag.id ? 'Salvando…' : 'Marcar como revisado'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(flag)}
                    disabled={busyId === flag.id || !flag.courseId}
                    className="inline-flex items-center gap-1 rounded-xl border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Apagar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
