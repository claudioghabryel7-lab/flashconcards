import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/apiAuth'
import { geminiModel } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  const authResult = await requireApiAuth(request)
  if ('error' in authResult) return authResult.error

  try {
    const { prompt } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
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
