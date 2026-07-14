import { NextResponse } from 'next/server'
import {
  collectGeminiApiKeys,
  geminiRequestWithKeyFallback,
} from '@/utils/geminiKeyPool.js'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 5 * 1024 * 1024
const MIN_BYTES = 400

function extractUrls(text = '') {
  const urls = String(text).match(/https?:\/\/[^\s"'<>\\]+/gi) || []
  const out = []
  const seen = new Set()
  for (const raw of urls) {
    let u = raw.replace(/[),.;]+$/g, '').trim()
    // limpa markdown/tracking comum
    u = u.replace(/&amp;/g, '&')
    if (!u || seen.has(u)) continue
    if (/google\.[a-z.]+\/(search|url|aclk)/i.test(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}

function looksLikeImageUrl(url) {
  return (
    /\.(png|jpe?g|webp|gif|svg|bmp)(\?|#|$)/i.test(url) ||
    /googleusercontent\.com|ggpht\.com|gstatic\.com|wikimedia\.org|wikipedia\.org|imgur\.com|fbcdn\.net|twimg\.com|pinimg\.com|bp\.blogspot|cloudfront\.net|amazonaws\.com|wp-content\/uploads|images\.|\/media\/|\/image/i.test(
      url,
    )
  )
}

function extractGeneratedText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || []
  return parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('')
    .trim()
}

async function wikiThumbnails(contest) {
  const urls = []
  try {
    const searchUrl =
      'https://pt.wikipedia.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: contest,
        srlimit: '6',
        format: 'json',
        origin: '*',
      })
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) })
    const searchJson = await searchRes.json()
    const titles = (searchJson?.query?.search || []).map((s) => s.title).filter(Boolean)

    for (const title of titles.slice(0, 5)) {
      try {
        const sumRes = await fetch(
          `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
          { signal: AbortSignal.timeout(12000) },
        )
        if (!sumRes.ok) continue
        const sum = await sumRes.json()
        const thumb = sum?.thumbnail?.source || sum?.originalimage?.source
        if (thumb) urls.push(thumb)
      } catch {
        // next
      }
    }
  } catch {
    // ignore
  }

  // Commons
  try {
    const commonsUrl =
      'https://commons.wikimedia.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        generator: 'search',
        gsrnamespace: '6',
        gsrsearch: contest,
        gsrlimit: '10',
        prop: 'imageinfo',
        iiprop: 'url|mime',
        iiurlwidth: '1200',
      })
    const res = await fetch(commonsUrl, { signal: AbortSignal.timeout(15000) })
    const json = await res.json()
    const pages = Object.values(json?.query?.pages || {})
    for (const page of pages) {
      const info = page?.imageinfo?.[0]
      const u = info?.thumburl || info?.url
      if (u && String(info?.mime || '').startsWith('image/')) urls.push(u)
    }
  } catch {
    // ignore
  }

  return [...new Set(urls)]
}

async function geminiFindAnyRelatedUrls(contest, { banca = '', referenceLink = '' } = {}) {
  if (!collectGeminiApiKeys().length) return []

  const prompt = `Com Google Search, encontre a LOGO / BRASÃO / EMBLEMA OFICIAL deste órgão/concurso.

Consulta: "${contest}"
${banca ? `Banca: ${banca}` : ''}
${referenceLink ? `Site: ${referenceLink}` : ''}

PRIORIDADE MÁXIMA (nesta ordem):
1) brasão oficial / logo oficial / emblema / insígnia (PNG/SVG preferível)
2) Wikipedia/Wikimedia do órgão
3) site .gov.br do órgão

Evite fotos de viatura, sede, pessoas, banners de cursinho — a menos que não haja logo.

NÃO invente URLs.

Retorne APENAS JSON:
{"logoUrls":["https://...png","https://..."],"imageUrls":["https://..."],"pageUrls":["https://..."]}`

  const { data } = await geminiRequestWithKeyFallback({
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    silent: true,
    buildBody: () => ({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    }),
  })

  const raw = extractGeneratedText(data)
  let parsed = {}
  try {
    parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || ['{}'])[0])
  } catch {
    parsed = {}
  }

  const logos = [...(parsed.logoUrls || [])]
  const listed = [...logos, ...(parsed.imageUrls || []), ...(parsed.photoUrls || [])]
  const pages = [...(parsed.pageUrls || [])]
  const fromText = extractUrls(raw)
  return {
    logos,
    images: [...listed, ...fromText.filter(looksLikeImageUrl)],
    pages: [...pages, ...fromText.filter((u) => !looksLikeImageUrl(u))],
  }
}

function scoreLogoCandidate(url = '') {
  const u = String(url).toLowerCase()
  let score = 0
  if (/bras[aã]o|coat.?of.?arms|emblema|insignia|ins[ií]gnia|escudo|badge|herald/.test(u)) score += 12
  if (/logo|simbolo|s[ií]mbolo/.test(u)) score += 8
  if (/wikimedia|wikipedia|commons/.test(u)) score += 6
  if (/\.gov\.br|\.mil\.br/.test(u)) score += 5
  if (/\.(png|svg)(\?|$)/.test(u)) score += 4
  if (/transparent|clipart/.test(u)) score += 2
  if (/viatura|quartel|sede|solenidade|formatura|pessoas|banner|curso|cursinho|youtube|thumb/.test(u))
    score -= 10
  if (/foto|photo|flickr/.test(u)) score -= 3
  return score
}

function rankLogoFirst(urls = []) {
  return [...new Set(urls.filter(Boolean))].sort((a, b) => scoreLogoCandidate(b) - scoreLogoCandidate(a))
}

async function jinaGoogleImages(query) {
  const q = encodeURIComponent(query)
  const endpoints = [
    `https://r.jina.ai/http://www.google.com/search?tbm=isch&hl=pt-BR&safe=active&q=${q}`,
    `https://r.jina.ai/http://www.bing.com/images/search?q=${q}`,
  ]
  const found = []
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: { Accept: 'text/plain' },
        signal: AbortSignal.timeout(25000),
      })
      if (!res.ok) continue
      const text = await res.text()
      found.push(...extractUrls(text).filter(looksLikeImageUrl))
    } catch {
      // next
    }
  }
  return [...new Set(found)]
}

async function extractPageImages(pageUrl) {
  try {
    const res = await fetch(`https://r.jina.ai/${pageUrl}`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return []
    const text = await res.text()
    const urls = extractUrls(text).filter(looksLikeImageUrl)
    const og = text.match(/og:image["'\s:=]+(https?:\/\/[^\s"'<>]+)/i)?.[1]
    if (og) urls.unshift(og)
    return [...new Set(urls)]
  } catch {
    return []
  }
}

async function downloadImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null

  const stripped = url.replace(/^https?:\/\//i, '')
  const attempts = [
    // weserv primeiro — contorna hotlink
    `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&n=-1&output=jpg`,
    url,
    `https://wsrv.nl/?url=${encodeURIComponent(stripped)}&n=-1&output=jpg`,
  ]

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt, {
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: 'https://www.google.com/',
        },
      })
      if (!res.ok) continue

      let contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength < MIN_BYTES || buf.byteLength > MAX_BYTES) continue

      const head = buf.slice(0, 64).toString('utf8')
      if (/<!doctype html|<html/i.test(head) || contentType.includes('text/html')) continue

      if (!contentType.startsWith('image/')) {
        if (buf[0] === 0x89 && buf[1] === 0x50) contentType = 'image/png'
        else if (buf[0] === 0xff && buf[1] === 0xd8) contentType = 'image/jpeg'
        else if (buf[0] === 0x52 && buf[1] === 0x49) contentType = 'image/webp'
        else if (buf[0] === 0x47 && buf[1] === 0x49) contentType = 'image/gif'
        else contentType = 'image/jpeg'
      }

      return {
        dataUrl: `data:${contentType};base64,${buf.toString('base64')}`,
        sourceUrl: url,
        bytes: buf.byteLength,
      }
    } catch {
      // next
    }
  }
  return null
}

async function downloadMany(urls, limit = 2) {
  const got = []
  const seen = new Set()
  for (const url of urls) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    const img = await downloadImage(url)
    if (img) {
      got.push(img)
      if (got.length >= limit) break
    }
  }
  return got
}

/**
 * Busca imagens relacionadas ao concurso (Google/Wiki/Bing) — sem exigir só .gov.br
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || '').trim()
    const competition = String(body.competition || '').trim()
    const banca = String(body.banca || '').trim()
    const referenceLink = String(body.referenceLink || '').trim()
    const contest = competition || name

    if (!contest) {
      return NextResponse.json({ error: 'Informe nome/concurso' }, { status: 400 })
    }

    const diagnostics = { sources: {} }
    const imageUrls = []
    const logoUrls = []
    const pageUrls = []

    // 1) Wikipedia / Commons — busca também "brasão"
    try {
      const wikiQueries = [contest, `${contest} brasão`, `${contest} logo oficial`]
      const wikiAll = []
      for (const q of wikiQueries) {
        wikiAll.push(...(await wikiThumbnails(q)))
      }
      const wiki = [...new Set(wikiAll)]
      diagnostics.sources.wiki = wiki.length
      imageUrls.push(...wiki)
      logoUrls.push(...wiki.filter((u) => scoreLogoCandidate(u) >= 4))
    } catch (err) {
      diagnostics.sources.wikiError = err?.message || String(err)
    }

    // 2) Gemini + Google Search grounding (prioriza logo oficial)
    try {
      const gem = await geminiFindAnyRelatedUrls(contest, { banca, referenceLink })
      diagnostics.sources.gemini = gem.images?.length || 0
      logoUrls.push(...(gem.logos || []))
      imageUrls.push(...(gem.images || []))
      pageUrls.push(...(gem.pages || []))
    } catch (err) {
      diagnostics.sources.geminiError = err?.message || String(err)
    }

    // 3) Google/Bing imagens — queries focadas em brasão/logo
    const queries = [
      `${contest} brasão oficial`,
      `${contest} logo oficial`,
      `${contest} emblema`,
      contest,
      banca ? `${contest} ${banca} logo` : null,
    ].filter(Boolean)

    for (const q of queries.slice(0, 4)) {
      const found = await jinaGoogleImages(q)
      diagnostics.sources[`web:${q.slice(0, 28)}`] = found.length
      imageUrls.push(...found)
      if (/bras[aã]o|logo|emblema/i.test(q)) logoUrls.push(...found)
    }

    // 4) Páginas (ref + páginas do Gemini)
    if (referenceLink) pageUrls.unshift(referenceLink)
    for (const page of [...new Set(pageUrls)].slice(0, 5)) {
      const imgs = await extractPageImages(page)
      diagnostics.sources[`page:${page.slice(0, 30)}`] = imgs.length
      imageUrls.push(...imgs)
    }

    const ranked = rankLogoFirst([...logoUrls, ...imageUrls])
    diagnostics.candidates = ranked.length
    diagnostics.sample = ranked.slice(0, 8)

    const downloaded = await downloadMany(ranked, 4)
    diagnostics.downloaded = downloaded.length

    if (!downloaded.length) {
      return NextResponse.json(
        {
          error:
            'Não consegui baixar o brasão/logo deste concurso. Tente o nome completo do órgão (ex.: Polícia Civil de Goiás) ou um link de referência com a logo.',
          diagnostics,
        },
        { status: 404 },
      )
    }

    // Melhor candidato = logo (primeiro do ranking)
    const logo = downloaded[0]
    const photo = downloaded[1] || downloaded[0]

    return NextResponse.json({
      ok: true,
      logo: { dataUrl: logo.dataUrl, sourceUrl: logo.sourceUrl },
      photo: { dataUrl: photo.dataUrl, sourceUrl: photo.sourceUrl },
      diagnostics,
    })
  } catch (err) {
    console.error('[api/course-cover-assets]', err)
    return NextResponse.json(
      { error: err?.message || 'Falha ao buscar imagens' },
      { status: 500 },
    )
  }
}
