'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowPathIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import { auth } from '../../firebase/config'

const SCAN_INTERVAL_MS = 5 * 60 * 1000

const QUICK_PROMPTS = [
  'Liste o que preciso corrigir agora, por prioridade.',
  'Por que o site pode estar com erros no console?',
  'Como validar se Firestore e Cloud Functions estão OK?',
  'O que falta configurar para pagamentos PIX?',
]

function severityStyle(severity) {
  if (severity === 'critical')
    return 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100'
  if (severity === 'warning')
    return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
  return 'border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-100'
}

function issueFingerprint(issues = []) {
  return issues.map((i) => `${i.severity}:${i.title}`).sort().join('|')
}

function formatScanTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function buildWelcome(scan) {
  if (!scan) return 'Não foi possível analisar o site. Clique em "Analisar site".'

  const lines = [
    `**Diagnóstico** — ${scan.summary}`,
    '',
    `📊 GCP/Firestore: ${scan.stats?.courses ?? '?'} curso(s), ${scan.stats?.users ?? '?'} usuário(s), ${scan.stats?.geminiKeyCount ?? 0} chave(s) Gemini.`,
    `Health GCP: ${scan.stats?.gcpHealthStatus ?? '?'}`,
  ]

  if (scan.issues?.length) {
    lines.push('', '**Problemas detectados:**')
    scan.issues.forEach((issue, idx) => {
      const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵'
      lines.push(`${idx + 1}. ${icon} **${issue.title}** — ${issue.detail}`)
      if (issue.action) lines.push(`   → ${issue.action}`)
    })
    lines.push('', 'Pergunte como corrigir ou use **Copiar para Cursor** para abrir no Agent.')
  }

  return lines.join('\n')
}

export default function AdminOpsAssistant() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [scan, setScan] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const lastFingerprint = useRef('')
  const scrollRef = useRef(null)

  const appendMessage = useCallback((msg) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    ])
  }, [])

  const runScan = useCallback(
    async ({ proactive = false, silent = false } = {}) => {
      setScanning(true)
      setError('')
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) throw new Error('Faça login como admin.')

        const res = await fetch('/api/admin/ops-scan', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Falha na varredura')

        setScan(data)
        const fp = issueFingerprint(data.issues)

        if (!silent && !proactive && messages.length === 0) {
          appendMessage({ role: 'assistant', kind: 'scan', content: buildWelcome(data) })
          lastFingerprint.current = fp
        } else if (proactive && fp && fp !== lastFingerprint.current) {
          appendMessage({
            role: 'assistant',
            kind: 'alert',
            content: `⚠️ **Mudança detectada**\n\n${buildWelcome(data)}`,
          })
          lastFingerprint.current = fp
        } else if (!silent && !proactive) {
          appendMessage({
            role: 'assistant',
            kind: 'scan',
            content: `Varredura atualizada: ${data.summary}`,
          })
          lastFingerprint.current = fp
        }
      } catch (err) {
        const msg = err.message || 'Erro na varredura'
        setError(msg)
        if (!proactive && !silent) appendMessage({ role: 'assistant', kind: 'error', content: msg })
      } finally {
        setScanning(false)
      }
    },
    [appendMessage, messages.length],
  )

  useEffect(() => {
    runScan()
    const interval = setInterval(() => runScan({ proactive: true }), SCAN_INTERVAL_MS)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, scanning, sending])

  const sendMessage = async (textOverride) => {
    const text = (textOverride ?? input).trim()
    if (!text || sending) return

    appendMessage({ role: 'user', kind: 'chat', content: text })
    if (!textOverride) setInput('')
    setSending(true)
    setError('')

    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Faça login como admin.')

      const history = messages
        .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.kind === 'chat'))
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/admin/ops-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, history, scan }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha no chat')

      appendMessage({ role: 'assistant', kind: 'chat', content: data.reply })
    } catch (err) {
      const msg = err.message || 'Erro ao enviar'
      setError(msg)
      appendMessage({ role: 'assistant', kind: 'error', content: msg })
    } finally {
      setSending(false)
    }
  }

  const copyForCursor = async () => {
    const prompt =
      scan?.cursorPrompt ||
      'Analise erros do Flashconcards (Firebase/GCP) e sugira correções no código.'
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não foi possível copiar. Selecione o texto manualmente.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <WrenchScrewdriverIcon className="h-6 w-6 text-violet-500" />
            Assistente de Correção (Gemini)
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Identifica erros do site, sugere correções e gera prompt para colar no Cursor Agent.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyForCursor}
            disabled={!scan}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100"
          >
            <ClipboardDocumentIcon className="h-4 w-4" />
            {copied ? 'Copiado!' : 'Copiar para Cursor'}
          </button>
          <button
            type="button"
            onClick={() => runScan()}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            <ArrowPathIcon className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
            Analisar site
          </button>
        </div>
      </div>

      {scan && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Cursos', scan.stats?.courses ?? '—'],
            ['Usuários', scan.stats?.users ?? '—'],
            ['Health GCP', scan.stats?.gcpHealthStatus ?? '—'],
            ['Gemini', scan.stats?.geminiKeyCount ?? 0],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{String(value)}</div>
            </div>
          ))}
        </div>
      )}

      {scan?.issues?.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
            Pendências — {formatScanTime(scan.scannedAt)}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {scan.issues.map((issue) => (
              <div
                key={issue.title}
                className={`rounded-xl border p-3 text-sm ${severityStyle(issue.severity)}`}
              >
                <div className="font-bold">{issue.title}</div>
                <div className="mt-1 opacity-90">{issue.detail}</div>
                {issue.action && (
                  <div className="mt-2 text-xs font-medium opacity-80">→ {issue.action}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => sendMessage(q)}
            disabled={sending}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex h-[min(480px,55vh)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-700">
          <ChatBubbleLeftRightIcon className="h-4 w-4" />
          Chat — alertas automáticos a cada 5 min
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && scanning && (
            <div className="text-sm text-slate-500">Analisando Firebase, GCP e configurações…</div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'ml-auto bg-violet-600 text-white'
                  : msg.kind === 'alert'
                    ? 'border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30'
                    : msg.kind === 'error'
                      ? 'border border-red-300 bg-red-50 text-red-900'
                      : 'border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              {msg.kind === 'alert' && (
                <div className="mb-2 flex items-center gap-1 text-xs font-bold uppercase text-amber-700">
                  <BoltIcon className="h-4 w-4" /> Alerta
                </div>
              )}
              {msg.content}
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Descreva o erro ou peça um plano de correção…"
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              disabled={sending}
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={sending || !input.trim()}
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
