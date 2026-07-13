import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { FlagIcon, CheckIcon, TrashIcon } from '@heroicons/react/24/outline'
import {
  deleteContentFlag,
  resolveContentFlag,
  subscribeOpenFlags,
} from '../../services/contentFeedbackService'

/**
 * Painel de Moderação — foco em conteúdos sinalizados pelos alunos.
 * O Professor IA só corrige o que aparece aqui.
 */
export default function AdminContentModeration() {
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

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

  const handleResolve = async (flag) => {
    if (!flag.courseId) {
      alert('Sinalização sem courseId — não é possível marcar.')
      return
    }
    setBusyId(flag.id)
    try {
      await resolveContentFlag(flag.courseId, flag.id)
    } catch (e) {
      console.error(e)
      alert('Erro ao marcar como resolvido.')
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
      alert('Erro ao apagar sinalização.')
    } finally {
      setBusyId(null)
    }
  }

  const typeLabel = (t) => {
    if (t === 'questao') return 'Questão'
    if (t === 'flashcard') return 'Flashcard'
    if (t === 'material') return 'Material'
    return t || 'Conteúdo'
  }

  return (
    <div className="space-y-6">
      <div className="cp-card !rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--cp-accent-4)]/30 bg-[var(--cp-accent-4)]/10">
            <FlagIcon className="h-5 w-5 text-[var(--cp-accent-4)]" />
          </div>
          <div>
            <h2 className="cp-headline text-lg text-cp-text">Moderação — Sinalizações</h2>
            <p className="text-sm text-cp-muted">
              Conteúdos reportados pelos alunos. O Professor IA corrige somente estes itens.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-cp-muted">
          {loading ? 'Carregando…' : `${flags.length} sinalização(ões) aberta(s)`}
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
            return (
              <div key={`${flag.courseId}-${flag.id}`} className="cp-card !rounded-2xl space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <span className="cp-badge cp-badge-accent !text-[10px]">
                      {typeLabel(flag.contentType)}
                    </span>
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

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleResolve(flag)}
                    disabled={busyId === flag.id || !flag.courseId}
                    className="cp-btn-primary !text-xs"
                  >
                    <CheckIcon className="h-4 w-4" />
                    {busyId === flag.id ? 'Salvando…' : 'Marcar como corrigido'}
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
