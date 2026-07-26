import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/apiAuth'
import { getOllamaBaseUrl } from '@/lib/serverSecrets'
import { listOllamaModels } from '@/lib/ollamaClient.js'

/** Lista modelos da IA local (Ollama) sem expor config ao browser. */
export async function GET(request: NextRequest) {
  const authResult = await requireApiAuth(request)
  if ('error' in authResult) return authResult.error

  try {
    const data = await listOllamaModels()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[api/gemini/models] ollama', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : `Falha ao listar modelos em ${getOllamaBaseUrl()}`,
      },
      { status: 500 },
    )
  }
}
