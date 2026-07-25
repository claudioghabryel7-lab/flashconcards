'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowPathIcon, StopIcon } from '@heroicons/react/24/outline'
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { auth, db } from '../../firebase/config'
import { cancelGenerationJob, GENERATION_JOB_STATUS } from '../../services/generationJobService'

function formatTs(value) {
  if (!value) return '—'
  try {
    const date = value?.toDate?.() || (typeof value === 'number' ? new Date(value) : new Date(value))
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

/**
 * Lista jobs locais do admin logado (Firestore).
 * Sem Cloud Functions — geração só com /admin aberto.
 */
export default function AdminGenerationJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const uid = auth.currentUser?.uid

  useEffect(() => {
    if (!uid) {
      setJobs([])
      setLoading(false)
      setError('Faça login como admin.')
      return undefined
    }

    setLoading(true)
    setError('')
    const q = query(
      collection(db, 'users', uid, 'generationJobs'),
      orderBy('createdAt', 'desc'),
      limit(40),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        setJobs(
          snap.docs.map((d) => {
            const data = d.data() || {}
            return {
              id: d.id,
              userId: uid,
              ...data,
            }
          }),
        )
        setLoading(false)
      },
      (err) => {
        setError(err.message || 'Erro ao carregar jobs')
        setLoading(false)
      },
    )

    return () => unsub()
  }, [uid])

  const refresh = useCallback(() => {
    // snapshot já atualiza; só limpa erro
    setError('')
  }, [])

  const cancelJob = async (job) => {
    if (!job?.userId || !job?.id || busyId) return
    if (!window.confirm(`Cancelar job ${job.jobType || job.id}?`)) return
    setBusyId(job.id)
    try {
      await cancelGenerationJob(job.userId, job.id)
    } catch (err) {
      alert(err.message || 'Erro ao cancelar job')
    } finally {
      setBusyId('')
    }
  }

  const active = jobs.filter((j) =>
    [
      GENERATION_JOB_STATUS.PENDING,
      GENERATION_JOB_STATUS.RUNNING,
      GENERATION_JOB_STATUS.PAUSED,
      'waiting_quota',
      'waiting_resume',
    ].includes(j.status),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Jobs de geração (local)</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Processados na aba do admin (online). Mantenha o /admin aberto enquanto gera.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
        Ativos agora: <strong>{active.length}</strong> · histórico recente: <strong>{jobs.length}</strong>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Tipo</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Progresso</th>
              <th className="px-3 py-2 text-left font-semibold">Mensagem</th>
              <th className="px-3 py-2 text-left font-semibold">Criado</th>
              <th className="px-3 py-2 text-right font-semibold">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {jobs.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  Nenhum job recente.
                </td>
              </tr>
            )}
            {jobs.map((job) => {
              const canCancel = [
                'pending',
                'running',
                'paused',
                'waiting_quota',
                'waiting_resume',
              ].includes(job.status)
              return (
                <tr key={job.id}>
                  <td className="px-3 py-2 font-mono text-xs">{job.jobType || '—'}</td>
                  <td className="px-3 py-2">{job.status || '—'}</td>
                  <td className="px-3 py-2">{job.progress != null ? `${job.progress}%` : '—'}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-slate-600 dark:text-slate-300">
                    {job.message || '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatTs(job.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    {canCancel && (
                      <button
                        type="button"
                        disabled={busyId === job.id}
                        onClick={() => cancelJob(job)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <StopIcon className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
