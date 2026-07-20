import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PencilSquareIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import {
  ensureRedacaoPendingNotification,
  getRedacaoSummary,
  getWeeklyRedacaoQuota,
  listStudentRedacoes,
  MAX_REDACOES_POR_SEMANA,
} from '../services/redacaoStudentService'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

export default function RedacoesDashboardCard() {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || 'alego-default'
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [quota, setQuota] = useState(null)
  const [tema, setTema] = useState('')
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [sum, rows, q, cfg] = await Promise.all([
          getRedacaoSummary(user.uid, courseId),
          listStudentRedacoes(user.uid, courseId, { max: 8 }),
          getWeeklyRedacaoQuota(user.uid, courseId),
          getDoc(doc(db, 'courses', courseId, 'config', 'redacao')),
        ])
        if (cancelled) return
        const theme = cfg.exists() ? String(cfg.data()?.tema || '').trim() : ''
        setSummary(sum)
        setHistory(rows)
        setQuota(q)
        setTema(theme)
        const isPending = Boolean(theme) && q?.used === 0
        setPending(isPending)
        if (isPending) {
          ensureRedacaoPendingNotification(user.uid, courseId, { tema: theme }).catch(() => {})
        }
      } catch (err) {
        console.warn('[RedacoesDashboardCard]', err?.message || err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.uid, courseId])

  const perfect = history.filter((r) => r.isNota1000 || Number(r.nota) >= 1000)

  return (
    <div className="cp-tech-card col-span-1 overflow-hidden p-5 sm:col-span-2 lg:col-span-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--cp-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent)_10%,transparent)] text-[var(--cp-accent)]">
            <PencilSquareIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-bold text-cp-text">Redações</h2>
              {pending ? (
                <span className="rounded-md bg-amber-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                  Pendente
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-cp-muted">
              Acompanhe suas notas e evolução · limite {MAX_REDACOES_POR_SEMANA}/semana
            </p>
          </div>
        </div>
        <Link to="/treino-redacao" className="cp-btn-primary !text-xs">
          {pending ? 'Fazer redação da semana' : 'Abrir treino'}
        </Link>
      </div>

      {loading ? (
        <p className="mt-4 text-xs text-cp-muted">Carregando histórico…</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-cp-border bg-cp-bg/40 px-3 py-2">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Média</p>
              <p className="font-display text-xl font-bold text-cp-text">
                {summary?.averageNota ?? '—'}
              </p>
            </div>
            <div className="rounded-xl border border-cp-border bg-cp-bg/40 px-3 py-2">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Melhor</p>
              <p className="font-display text-xl font-bold text-[var(--cp-accent)]">
                {summary?.bestNota ?? '—'}
              </p>
            </div>
            <div className="rounded-xl border border-cp-border bg-cp-bg/40 px-3 py-2">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Notas 1000</p>
              <p className="font-display text-xl font-bold text-emerald-500">
                {summary?.nota1000Count ?? perfect.length}
              </p>
            </div>
            <div className="rounded-xl border border-cp-border bg-cp-bg/40 px-3 py-2">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Semana</p>
              <p className="font-display text-xl font-bold text-cp-text">
                {quota ? `${quota.used}/${quota.max}` : '—'}
              </p>
            </div>
          </div>

          {tema ? (
            <p className="mt-3 line-clamp-2 text-xs text-cp-muted">
              <span className="font-semibold text-cp-text">Tema da semana:</span> {tema}
            </p>
          ) : null}

          {perfect.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-emerald-500">
                <SparklesIcon className="h-3.5 w-3.5" />
                Redações nota 1000
              </p>
              <ul className="space-y-1.5">
                {perfect.slice(0, 3).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-cp-text"
                  >
                    <span className="font-bold text-emerald-600">1000</span>
                    <span className="mx-2 text-cp-muted">·</span>
                    <span className="line-clamp-1">{r.tema || 'Sem tema'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {history.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-cp-muted">
                Últimas notas
              </p>
              <div className="flex flex-wrap gap-2">
                {history.slice(0, 8).map((r) => (
                  <span
                    key={r.id}
                    title={r.tema}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${
                      Number(r.nota) >= 1000
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                        : 'border-cp-border bg-cp-bg/50 text-cp-text'
                    }`}
                  >
                    {r.nota}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-cp-muted">
              Nenhuma redação salva ainda. Faça a da semana para começar a acompanhar sua evolução.
            </p>
          )}
        </>
      )}
    </div>
  )
}
