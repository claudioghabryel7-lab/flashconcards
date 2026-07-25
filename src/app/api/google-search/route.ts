import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/apiAuth'
import { getGoogleSearchApiKey, getGoogleSearchEngineId } from '@/lib/serverSecrets'

export async function POST(request: NextRequest) {
  const authResult = await requireApiAuth(request)
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const query = String(body?.query || '').trim()
    const numResults = Math.min(10, Math.max(1, Number(body?.numResults) || 5))

    if (!query) {
      return NextResponse.json({ error: 'query é obrigatória' }, { status: 400 })
    }

    const apiKey = getGoogleSearchApiKey()
    const cx = getGoogleSearchEngineId()
    if (!apiKey || !cx) {
      return NextResponse.json({ items: [], warning: 'Google Search não configurado' })
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${numResults}`
    const response = await fetch(url)
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || `Search HTTP ${response.status}`, items: [] },
        { status: 502 },
      )
    }

    const items = (data.items || []).map(
      (item: { title?: string; snippet?: string; link?: string; displayLink?: string }) => ({
        title: item.title,
        snippet: item.snippet,
        link: item.link,
        displayLink: item.displayLink,
      }),
    )

    return NextResponse.json({ items })
  } catch (error) {
    console.error('[api/google-search]', error)
    return NextResponse.json({ error: 'Falha na busca', items: [] }, { status: 500 })
  }
}
