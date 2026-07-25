import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/apiAuth'
import {
  getGeminiApiKeys,
  geminiKeyExpiredUserMessage,
  isGeminiApiKeyError,
} from '@/lib/serverSecrets'

/** Lista modelos Gemini sem expor a API key ao browser. */
export async function GET(request: NextRequest) {
  const authResult = await requireApiAuth(request)
  if ('error' in authResult) return authResult.error

  const apiKeys = getGeminiApiKeys()
  if (!apiKeys.length) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY não configurada no servidor.' },
      { status: 503 },
    )
  }

  try {
    let lastError = 'Falha ao listar modelos'
    let sawKeyError = false

    for (const apiKey of apiKeys) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      )
      const data = await response.json()
      if (response.ok) {
        return NextResponse.json(data)
      }
      lastError = data.error?.message || `HTTP ${response.status}`
      if (isGeminiApiKeyError(lastError)) {
        sawKeyError = true
        continue
      }
      return NextResponse.json({ error: lastError }, { status: response.status })
    }

    if (sawKeyError) {
      return NextResponse.json(
        { error: geminiKeyExpiredUserMessage(), code: 'gemini_api_key_expired' },
        { status: 401 },
      )
    }
    return NextResponse.json({ error: lastError }, { status: 502 })
  } catch (error) {
    console.error('[api/gemini/models]', error)
    return NextResponse.json({ error: 'Falha ao listar modelos' }, { status: 500 })
  }
}
