import { NextRequest, NextResponse } from 'next/server'
import { geminiModel } from '@/lib/gemini'
import { checkApiRateLimit, clientKeyFromRequest } from '@/lib/apiRateLimit'

export async function POST(request: NextRequest) {
  try {
    const rl = checkApiRateLimit(`edital:${clientKeyFromRequest(request)}`, {
      limit: 10,
      windowMs: 60_000,
    })
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Limite de requisições. Tente em ${rl.retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const { prompt } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }
    if (prompt.length > 120_000) {
      return NextResponse.json({ error: 'Prompt excessivamente longo' }, { status: 413 })
    }

    const result = await geminiModel.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    let editalData
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        editalData = JSON.parse(jsonMatch[0])
      } else {
        editalData = JSON.parse(text)
      }
    } catch (parseError) {
      console.error('Erro ao fazer parse do JSON:', parseError)
      return NextResponse.json({ error: 'Failed to parse generated content' }, { status: 500 })
    }

    return NextResponse.json({ content: JSON.stringify(editalData) })
  } catch (error) {
    console.error('Error generating edital:', error)
    return NextResponse.json({ error: 'Failed to generate edital' }, { status: 500 })
  }
}
