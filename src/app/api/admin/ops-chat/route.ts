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
        { summary: scan.summary, scannedAt: scan.scannedAt, stats: scan.stats, issues: scan.issues },
        null,
        2,
      )
    : 'Varredura indisponível.'

  return `Você é o Assistente Ops do Flashconcards no painel Admin.
Stack atual: Firebase Auth + Firestore + Cloud Functions GCP + Next.js/Vercel. NÃO use Supabase.
Responda em português do Brasil, claro e acionável.

Suas tarefas:
1. Identificar causas prováveis dos erros com base na varredura.
2. Sugerir correções passo a passo (arquivos, env vars, deploy GCP).
3. Priorizar: login, Firestore, pagamentos, jobs de geração, Gemini.
4. Nunca pedir ou revelar secrets.

Quando o admin pedir para CORRIGIR algo, responda com:
- Diagnóstico (1 parágrafo)
- Passos numerados (comandos ou caminhos de arquivo quando souber)
- Como validar que funcionou

Última varredura:
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
    {
      role: 'model',
      parts: [{ text: 'Pronto. Vou diagnosticar e orientar correções no stack Firebase/GCP.' }],
    },
    ...history.flatMap((m) => [
      { role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] },
    ]),
    { role: 'user', parts: [{ text: message }] },
  ]

  try {
    const { data } = await geminiRequestWithKeyFallback({
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      silent: true,
      buildBody: () => ({
        contents,
        generationConfig: { temperature: 0.25, maxOutputTokens: 8192 },
      }),
    })

    const reply =
      extractGeneratedText(data) || 'Não consegui gerar resposta. Tente novamente ou rode "Analisar site".'
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[api/admin/ops-chat]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha ao consultar Gemini' },
      { status: 502 },
    )
  }
}
