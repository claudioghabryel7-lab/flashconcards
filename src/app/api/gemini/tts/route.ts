import { NextRequest, NextResponse } from 'next/server'
import { readEnv } from '@/lib/env.js'
import { getGeminiTtsModels } from '@/utils/geminiModels.js'

function getServerApiKey(): string {
  return readEnv('VITE_GEMINI_API_KEY') || ''
}

function extractAudioPart(data: any): { data: string; mimeType: string } | null {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return null
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data
    if (inline?.data) {
      return {
        data: inline.data,
        mimeType: inline.mimeType || inline.mime_type || 'audio/L16;rate=24000',
      }
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    const voiceName = typeof body?.voiceName === 'string' ? body.voiceName.trim() : 'Aoede'
    const styleHint =
      typeof body?.styleHint === 'string' && body.styleHint.trim()
        ? body.styleHint.trim()
        : 'Leia em português do Brasil, com voz de professor(a) de concursos: clara, persuasiva, calorosa e bem pausada. Não soe robótica.'

    if (!text) {
      return NextResponse.json({ error: 'Texto é obrigatório' }, { status: 400 })
    }

    const apiKey = getServerApiKey()
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Nenhuma API key Gemini no servidor. Configure VITE_GEMINI_API_KEY no Vercel e faça redeploy.',
        },
        { status: 503 }
      )
    }

    const prompt = `${styleHint}

Texto para ler em voz alta:
${text}`

    const models = getGeminiTtsModels()
    let lastError = 'Erro desconhecido'

    for (const model of models) {
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        lastError = data?.error?.message || `HTTP ${response.status}`
        if (response.status === 404 || response.status === 429 || response.status === 503) {
          continue
        }
        // outros erros: tenta próximo modelo mesmo assim
        continue
      }

      const audio = extractAudioPart(data)
      if (!audio?.data) {
        lastError = 'Resposta TTS sem áudio'
        continue
      }

      return NextResponse.json({
        audioBase64: audio.data,
        mimeType: audio.mimeType,
        voiceName,
        model,
      })
    }

    return NextResponse.json({ error: lastError }, { status: 502 })
  } catch (error) {
    console.error('[api/gemini/tts]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao gerar áudio Gemini' },
      { status: 500 }
    )
  }
}
