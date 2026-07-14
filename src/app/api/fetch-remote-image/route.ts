import { NextResponse } from 'next/server'

const MAX_BYTES = 4 * 1024 * 1024
const ALLOWED_HOST_HINTS = [
  '.gov.br',
  '.mil.br',
  '.leg.br',
  'wikipedia.org',
  'wikimedia.org',
  'googleusercontent.com',
  'ggpht.com',
  'bp.blogspot.com',
  'cloudfront.net',
  'amazonaws.com',
  'firebase',
  'storage.googleapis.com',
]

function isAllowedImageUrl(raw) {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    // Bloqueia IPs privados óbvios
    if (
      host === 'localhost' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.')
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

function prefersOfficial(raw) {
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return ALLOWED_HOST_HINTS.some((h) => host.includes(h.replace(/^\./, '')) || host.endsWith(h))
  } catch {
    return false
  }
}

/**
 * Proxy server-side para baixar imagens remotas (evita CORS no admin).
 * POST { url: string }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const url = String(body.url || '').trim()
    if (!url || !isAllowedImageUrl(url)) {
      return NextResponse.json({ error: 'URL de imagem inválida' }, { status: 400 })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (compatible; FlashConCardsBot/1.0; +https://flashconcards.com)',
      },
    })
    clearTimeout(timer)

    if (!res.ok) {
      return NextResponse.json({ error: `Falha ao baixar imagem (${res.status})` }, { status: 502 })
    }

    let contentType = (res.headers.get('content-type') || '').split(';')[0].trim()
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Imagem remota muito grande' }, { status: 413 })
    }
    if (buf.byteLength < 512) {
      return NextResponse.json({ error: 'Arquivo de imagem inválido/pequeno demais' }, { status: 400 })
    }

    // Aceita octet-stream / tipo ausente (muitos .gov.br)
    if (!contentType.startsWith('image/')) {
      if (buf[0] === 0x89 && buf[1] === 0x50) contentType = 'image/png'
      else if (buf[0] === 0xff && buf[1] === 0xd8) contentType = 'image/jpeg'
      else if (buf[0] === 0x52 && buf[1] === 0x49) contentType = 'image/webp'
      else if (contentType.includes('text/html')) {
        return NextResponse.json({ error: 'URL não retornou imagem' }, { status: 400 })
      } else {
        contentType = 'image/jpeg'
      }
    }

    const mime = contentType
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`

    return NextResponse.json({
      ok: true,
      mime,
      bytes: buf.byteLength,
      officialHint: prefersOfficial(url),
      dataUrl,
      sourceUrl: url,
    })
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'Timeout ao baixar imagem' : err?.message || 'Erro'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
