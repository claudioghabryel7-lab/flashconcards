'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import {
  aggregateUsageRows,
  fetchAiUsageDaily,
  fetchAiUsageEvents,
} from '../../services/aiUsageTracker'
import { formatTokens, formatUsd, GEMINI_PRICE_PER_1M } from '../../utils/geminiPricing'

function formatTs(ms) {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

/**
 * Painel admin: tokens e custo estimado das chamadas Gemini.
 */
export default function AdminAiUsageCosts() {
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [events, setEvents] = useState([])
  const [daily, setDaily] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ev, dy] = await Promise.all([
        fetchAiUsageEvents({ days, max: 800 }),
        fetchAiUsageDaily({ days }),
      ])
      setEvents(ev)
      setDaily(dy)
    } catch (err) {
      console.error('[AdminAiUsageCosts]', err)
      setError(
        err?.message ||
          'Falha ao carregar uso. Verifique as regras do Firestore (aiUsageEvents / aiUsageDaily).',
      )
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => aggregateUsageRows(events), [events])
  const today = daily[0] || null

  const purposeRows = useMemo(
    () =>
      Object.entries(summary.byPurpose)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.estimatedUsd - a.estimatedUsd),
    [summary],
  )

  const modelRows = useMemo(
    () =>
      Object.entries(summary.byModel)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.estimatedUsd - a.estimatedUsd),
    [summary],
  )

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 dark:border-emerald-800 dark:from-emerald-900/20 dark:to-teal-900/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-emerald-800 dark:text-emerald-200">
              Custos de IA (Gemini)
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Estimativa com base no <code className="text-xs">usageMetadata</code> de cada chamada.
              Valores em USD pela tabela oficial aproximada — confira a fatura Google Cloud / AI Studio
              para o valor cobrado.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value={7}>7 dias</option>
              <option value={14}>14 dias</option>
              <option value={30}>30 dias</option>
            </select>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Chamadas" value={String(summary.calls)} sub={today ? `Hoje: ${today.calls || 0}` : ''} />
        <StatCard
          label="Tokens totais"
          value={formatTokens(summary.totalTokens)}
          sub={`${formatTokens(summary.promptTokens)} in · ${formatTokens(summary.outputTokens)} out`}
        />
        <StatCard
          label="Custo estimado"
          value={formatUsd(summary.estimatedUsd)}
          sub={today ? `Hoje: ${formatUsd(today.estimatedUsd || 0)}` : ''}
          highlight
        />
        <StatCard
          label="Média / chamada"
          value={summary.calls ? formatUsd(summary.estimatedUsd / summary.calls) : '—'}
          sub={summary.calls ? `${formatTokens(Math.round(summary.totalTokens / summary.calls))} tokens` : ''}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-3 font-bold text-slate-900 dark:text-white">Por tipo de geração</h3>
          {purposeRows.length === 0 ? (
            <p className="text-sm text-slate-500">Ainda sem dados. Gere material/questões para começar a registrar.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-600">
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Calls</th>
                  <th className="py-2">Tokens</th>
                  <th className="py-2">US$</th>
                </tr>
              </thead>
              <tbody>
                {purposeRows.map((row) => (
                  <tr key={row.name} className="border-b border-slate-100 dark:border-slate-700/60">
                    <td className="py-2 font-medium">{row.name}</td>
                    <td className="py-2">{row.calls}</td>
                    <td className="py-2">{formatTokens(row.totalTokens)}</td>
                    <td className="py-2 font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatUsd(row.estimatedUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-3 font-bold text-slate-900 dark:text-white">Por modelo</h3>
          {modelRows.length === 0 ? (
            <p className="text-sm text-slate-500">Sem dados ainda.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-600">
                  <th className="py-2">Modelo</th>
                  <th className="py-2">Calls</th>
                  <th className="py-2">Tokens</th>
                  <th className="py-2">US$</th>
                </tr>
              </thead>
              <tbody>
                {modelRows.map((row) => (
                  <tr key={row.name} className="border-b border-slate-100 dark:border-slate-700/60">
                    <td className="py-2 font-mono text-xs">{row.name}</td>
                    <td className="py-2">{row.calls}</td>
                    <td className="py-2">{formatTokens(row.totalTokens)}</td>
                    <td className="py-2 font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatUsd(row.estimatedUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-3 font-bold text-slate-900 dark:text-white">Últimas chamadas</h3>
        {loading ? (
          <p className="text-sm text-slate-500">Carregando…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum evento registrado neste período.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white dark:bg-slate-800">
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-600">
                  <th className="py-2 pr-2">Quando</th>
                  <th className="py-2 pr-2">Tipo</th>
                  <th className="py-2 pr-2">Modelo</th>
                  <th className="py-2 pr-2">In</th>
                  <th className="py-2 pr-2">Out</th>
                  <th className="py-2">US$</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 100).map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-xs text-slate-500">
                      {formatTs(e.createdAtMs)}
                    </td>
                    <td className="py-1.5 pr-2">{e.purpose || '—'}</td>
                    <td className="py-1.5 pr-2 font-mono text-[11px]">{e.model}</td>
                    <td className="py-1.5 pr-2">{formatTokens(e.promptTokens)}</td>
                    <td className="py-1.5 pr-2">{formatTokens(e.outputTokens)}</td>
                    <td className="py-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatUsd(e.estimatedUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
        <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
          Tabela de preços usada na estimativa (USD / 1M tokens)
        </summary>
        <ul className="mt-3 space-y-1 font-mono text-xs text-slate-600 dark:text-slate-400">
          {Object.entries(GEMINI_PRICE_PER_1M).map(([model, p]) => (
            <li key={model}>
              {model}: in ${p.inputPer1M} · out ${p.outputPer1M}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function StatCard({ label, value, sub, highlight }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  )
}
