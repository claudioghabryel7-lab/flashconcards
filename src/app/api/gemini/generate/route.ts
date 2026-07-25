import { NextRequest, NextResponse } from 'next/server'
import { readEnv } from '@/lib/env.js'
import { getDefaultGeminiModels, withCostSafeThinking } from '@/utils/geminiModels.js'
import { checkApiRateLimit, clientKeyFromRequest } from '@/lib/apiRateLimit'

const DEFAULT_MODELS = getDefaultGeminiModels()

function getServerApiKey(): string {
  return readEnv('VITE_GEMINI_API_KEY') || ''
}

export async function POST(request: NextRequest) {
  try {
    const rl = checkApiRateLimit(`gemini:${clientKeyFromRequest(request)}`, {
      limit: 30,
      windowMs: 60_000,
    })
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Limite de requisições. Tente em ${rl.retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const body = await request.json()
    const {
      prompt,
      generationConfig = {
        temperature: 0.35,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
      useGoogleSearch = false,
      useFunctionCalling = false,
      tools = [],
      models = DEFAULT_MODELS,
      thinkingLevel = 'minimal',
    } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt é obrigatório' }, { status: 400 })
    }

    // Cap de prompt: evita payload abusivo / contexto gigante
    if (prompt.length > 200_000) {
      return NextResponse.json({ error: 'Prompt excessivamente longo' }, { status: 413 })
    }

    // Cliente não pode forçar Pro via body (thinking caro)
    const safeModels = (Array.isArray(models) ? models : DEFAULT_MODELS)
      .map(String)
      .filter((m) => m && !/pro/i.test(m))
    const modelList = safeModels.length ? safeModels : DEFAULT_MODELS

    const apiKey = getServerApiKey()
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Nenhuma API key Gemini no servidor. Configure VITE_GEMINI_API_KEY no .env.local ou no Vercel.',
        },
        { status: 503 }
      )
    }

    let lastError = 'Erro desconhecido'

    for (const model of modelList) {
      const safeConfig = withCostSafeThinking(generationConfig, model, thinkingLevel)
      const requestBody: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: safeConfig,
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

      // thinkingConfig rejeitado → tenta sem ele
      if (
        response.status === 400 &&
        /thinking/i.test(String(data.error?.message || '')) &&
        (safeConfig as { thinkingConfig?: unknown }).thinkingConfig
      ) {
        const retryBody = {
          ...requestBody,
          generationConfig: { ...(generationConfig || {}) },
        }
        delete (retryBody.generationConfig as { thinkingConfig?: unknown }).thinkingConfig
        const retryRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(retryBody),
          }
        )
        const retryData = await retryRes.json()
        if (retryRes.ok) return NextResponse.json(retryData)
        lastError = retryData.error?.message || `HTTP ${retryRes.status}`
        if (retryRes.status === 429 || retryRes.status === 503 || retryRes.status === 404) continue
        continue
      }

      lastError = data.error?.message || `HTTP ${response.status}`
      if (response.status === 429 || response.status === 503 || response.status === 404) {
        continue
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
