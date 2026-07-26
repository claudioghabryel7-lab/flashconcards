import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/apiAuth'
import { getOllamaBaseUrl, getOllamaModels } from '@/lib/serverSecrets'
import { generateWithOllama } from '@/lib/ollamaClient.js'
import { getDefaultGeminiModels } from '@/utils/geminiModels.js'
import { hasUsableGeminiText, getGeminiFinishReason } from '@/utils/geminiResponseUtils.js'

/**
 * Proxy autenticado: o site chama esta rota "como Gemini",
 * e o servidor encaminha para a IA local (Ollama) no PC.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireApiAuth(request)
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const defaultModels = getDefaultGeminiModels()
    const {
      prompt,
      generationConfig = { temperature: 0.35, maxOutputTokens: 32000 },
      models = defaultModels,
    } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt é obrigatório' }, { status: 400 })
    }

    const modelList =
      Array.isArray(models) && models.length
        ? models
        : getOllamaModels().length
          ? getOllamaModels()
          : defaultModels

    let lastError = 'Erro desconhecido'

    for (const model of modelList) {
      try {
        const data = await generateWithOllama(prompt, {
          model,
          generationConfig,
        })

        if (hasUsableGeminiText(data)) {
          return NextResponse.json(data)
        }

        lastError = `A IA local não retornou texto (finishReason=${getGeminiFinishReason(data) || 'EMPTY'})`
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        continue
      }
    }

    return NextResponse.json(
      {
        error: lastError,
        code: 'ai_empty_response',
        hint: `Confirme que o Ollama está rodando em ${getOllamaBaseUrl()} no seu PC.`,
      },
      { status: 502 },
    )
  } catch (error) {
    console.error('[api/gemini/generate] ollama', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Falha ao chamar a IA local (Ollama no PC)',
      },
      { status: 500 },
    )
  }
}
