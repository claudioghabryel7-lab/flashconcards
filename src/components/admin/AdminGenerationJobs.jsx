'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowPathIcon, StopIcon } from '@heroicons/react/24/outline'
import { auth } from '../../firebase/config'
import { BACKEND_FUNCTIONS } from '../../config/backendFunctions'

function formatTs(ms) {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

export default function AdminGenerationJobs() {
  const [jobs, setJobs] = useState([])
  const [concurrency, setConcurrency] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const loadJobs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Faça login como admin.')

      const res = await fetch(BACKEND_FUNCTIONS.listActiveGenerationJobs, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao listar jobs')

      setJobs(Array.isArray(data.jobs) ? data.jobs : [])
      setConcurrency(data.concurrency || null)
    } catch (err) {
      setError(err.message || 'Erro ao carregar jobs')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
    const t = setInterval(loadJobs, 30000)
    return () => clearInterval(t)
  }, [loadJobs])

  const cancelJob = async (job) => {
    if (!job?.userId || !job?.id || busyId) return
    if (!window.confirm(`Cancelar job ${job.jobType || job.id}?`)) return
    setBusyId(job.id)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(BACKEND_FUNCTIONS.cancelGenerationJob, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: job.userId, jobId: job.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao cancelar')
      await loadJobs()
    } catch (err) {
      alert(err.message || 'Erro ao cancelar job')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Jobs de geração (nuvem)</h2>
          <p className="text-sm text-slate-600">
            Fila Gemini — retomada automática a cada 10 min + nudge do cliente a cada 30s.
          </p>
        </div>
        <button
          type="button"
          onClick={loadJobs}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {concurrency ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          Slots Gemini: <strong>{concurrency.runningCount ?? 0}</strong> /{' '}
          <strong>{concurrency.maxConcurrent ?? 2}</strong> em execução
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading && !jobs.length ? (
        <p className="text-sm text-slate-500">Carregando jobs…</p>
      ) : null}

      {!loading && !jobs.length && !error ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          Nenhum job ativo no servidor.
        </p>
      ) : null}

      {jobs.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Tipo</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Curso</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Progresso</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Atualizado</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {jobs.map((job) => (
                <tr key={job.path || job.id}>
                  <td className="px-3 py-2 font-mono text-xs">{job.jobType || '—'}</td>
                  <td className="px-3 py-2">{job.status}</td>
                  <td className="px-3 py-2 font-mono text-xs">{job.courseId || '—'}</td>
                  <td className="max-w-xs truncate px-3 py-2" title={job.message || ''}>
                    {job.progress != null ? `${job.progress}%` : '—'}
                    {job.message ? ` — ${job.message}` : ''}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {formatTs(job.updatedAt || job.lastHeartbeat)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => cancelJob(job)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <StopIcon className="h-3.5 w-3.5" />
                      Cancelar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
