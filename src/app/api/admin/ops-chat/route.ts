import { NextResponse } from 'next/server'
import { createRequire } from 'module'

import { verifyAdminRequest } from '@/lib/server/adminAuth'
import type { OpsScanResult } from '@/lib/server/opsScan'

export const runtime = 'nodejs'
export const maxDuration = 120

const require = createRequire(import.meta.url)
const { geminiRequestWithKeyFallback } = require('../../../../utils/geminiKeyPool.js')
const { extractGeneratedText } = require('../../../../utils/geminiApi.js')

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function buildSystemPrompt(scan: OpsScanResult | null) {
  const scanBlock = scan
    ? JSON.stringify(
        {
          summary: scan.summary,
          scannedAt: scan.scannedAt,
          stats: scan.stats,
          issues: scan.issues,
        },
        null,
        2,
      )
    : 'Varredura não disponível.'

  return `Você é o Assistente Ops interno do Flashconcards (painel admin).
Responda em português do Brasil, de forma clara e acionável.
Você ajuda o administrador a entender erros, configuração (Supabase, Gemini, Mercado Pago, e-mail) e priorizar correções.
Não invente dados — use apenas o contexto da varredura e a pergunta do admin.
Quando sugerir correções, liste passos numerados e arquivos/caminhos relevantes do projeto quando souber.
Nunca peça ou revele secrets (.env, service role, API keys).

Contexto da última varredura do sistema:
${scanBlock}`
}

export async function POST(request: Request) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
  }

  let body: { message?: string; history?: ChatMessage[]; scan?: OpsScanResult | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const message = (body.message || '').trim()
  if (!message) {
    return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })
  }

  const history = Array.isArray(body.history) ? body.history.slice(-12) : []
  const scan = body.scan ?? null

  const contents = [
    { role: 'user', parts: [{ text: buildSystemPrompt(scan) }] },
    { role: 'model', parts: [{ text: 'Entendido. Estou pronto para ajudar com diagnóstico e correções do Flashconcards.' }] },
    ...history.flatMap((m) => [
      {
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      },
    ]),
    { role: 'user', parts: [{ text: message }] },
  ]

  try {
    const { data } = await geminiRequestWithKeyFallback({
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      silent: true,
      buildBody: () => ({
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
      }),
    })

    const reply = extractGeneratedText(data) || 'Não consegui gerar uma resposta. Tente novamente.'
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[api/admin/ops-chat]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha ao consultar Gemini' },
      { status: 502 },
    )
  }
}
