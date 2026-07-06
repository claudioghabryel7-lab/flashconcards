import { NextRequest, NextResponse } from 'next/server'
import { readEnv } from '@/lib/env.js'

const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']

function loadServerApiKeys(): string[] {
  const keys: string[] = []
  const main = readEnv('VITE_GEMINI_API_KEY') || readEnv('VITE_GOOGLE_AI_API_KEY')
  if (main) keys.push(main)
  for (let i = 1; i <= 10; i++) {
    const k = readEnv(`VITE_GEMINI_API_KEY_${i}`)
    if (k && !keys.includes(k)) keys.push(k)
  }
  return keys
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      prompt,
      generationConfig = { temperature: 0.35, maxOutputTokens: 32000 },
      useGoogleSearch = true,
      verifyContent = true,
      courseId = null,
      useFunctionCalling = false,
      tools = [],
      models = DEFAULT_MODELS,
    } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt é obrigatório' }, { status: 400 })
    }

    const apiKeys = loadServerApiKeys()
    if (apiKeys.length === 0) {
      return NextResponse.json(
        {
          error:
            'Nenhuma API key Gemini no servidor. Configure VITE_GEMINI_API_KEY no .env.local ou no Vercel.',
        },
        { status: 503 }
      )
    }

    let lastError = 'Erro desconhecido'

    for (const model of models) {
      for (const apiKey of apiKeys) {
        const requestBody: Record<string, unknown> = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig,
        }

        if (useGoogleSearch) {
          requestBody.tools = [{ googleSearch: {} }]
        }
        if (useFunctionCalling && Array.isArray(tools) && tools.length > 0) {
          requestBody.tools = [...((requestBody.tools as unknown[]) || []), ...tools]
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          }
        )

        const data = await response.json()

        if (response.ok) {
          return NextResponse.json(data)
        }

        lastError = data.error?.message || `HTTP ${response.status}`
        if (response.status === 429 || response.status === 503) {
          continue
        }
      }
    }

    return NextResponse.json({ error: lastError }, { status: 502 })
  } catch (error) {
    console.error('[api/gemini/generate]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao chamar Gemini' },
      { status: 500 }
    )
  }
}
