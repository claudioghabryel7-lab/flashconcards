import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/apiAuth'
import { getGroqApiKey } from '@/lib/serverSecrets'

export async function POST(request: NextRequest) {
  const authResult = await requireApiAuth(request)
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const {
      messages,
      model = 'llama-3.3-70b-versatile',
      temperature = 0.7,
      max_tokens = 2000,
      system,
    } = body

    let finalMessages = Array.isArray(messages) ? messages : []
    if (system && typeof system === 'string') {
      finalMessages = [{ role: 'system', content: system }, ...finalMessages]
    }

    if (!finalMessages.length) {
      return NextResponse.json({ error: 'messages é obrigatório' }, { status: 400 })
    }

    const apiKey = getGroqApiKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY não configurada no servidor.' },
        { status: 503 },
      )
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: finalMessages,
        temperature,
        max_tokens,
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || `Groq HTTP ${response.status}` },
        { status: response.status >= 400 && response.status < 600 ? response.status : 502 },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[api/groq/generate]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao chamar Groq' },
      { status: 500 },
    )
  }
}
