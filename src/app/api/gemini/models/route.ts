import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/apiAuth'
import { getGeminiApiKey } from '@/lib/serverSecrets'

/** Lista modelos Gemini sem expor a API key ao browser. */
export async function GET(request: NextRequest) {
  const authResult = await requireApiAuth(request)
  if ('error' in authResult) return authResult.error

  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY não configurada no servidor.' },
      { status: 503 },
    )
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    )
    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || `HTTP ${response.status}` },
        { status: response.status },
      )
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('[api/gemini/models]', error)
    return NextResponse.json({ error: 'Falha ao listar modelos' }, { status: 500 })
  }
}
