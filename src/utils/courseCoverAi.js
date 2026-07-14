import { readEnv } from '@/lib/env.js'
import {
  callGeminiWithRetry,
  extractGeneratedText,
  hasGeminiApiKeys,
  formatAiErrorForUser,
} from './geminiApi'
import { geminiRequestWithKeyFallback } from './geminiKeyPool'
import { googleImageSearch, rankOfficialImageResults, isLikelyOfficialDomain } from './googleImageSearch'

const IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-preview-image-generation',
]

function cleanDescription(text) {
  let out = String(text || '').trim()
  if (!out) return ''

  // Se a IA (por engano) devolveu JSON, tenta extrair campo texto
  if (out.startsWith('{') || out.startsWith('[')) {
    try {
      const parsed = JSON.parse(out)
      const candidate =
        parsed?.descricao ||
        parsed?.description ||
        parsed?.texto ||
        parsed?.text ||
        (Array.isArray(parsed) ? parsed[0]?.descricao || parsed[0]?.text : null)
      if (candidate) out = String(candidate)
    } catch {
      // mantém texto bruto
    }
  }

  out = out
    .replace(/^```(?:text|markdown|json)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^["«»']+|["«»']+$/g, '')
    .replace(/^\*\*?Descrição:?\*\*?\s*/i, '')
    .replace(/^Descrição:\s*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out
}

/**
 * Gera descrição completa do curso.
 * IMPORTANTE: NÃO usar silent:true — isso injeta regras de JSON e corta o texto.
 */
export async function generateCourseDescriptionAi({
  name,
  competition,
  banca = '',
  price,
  originalPrice,
} = {}) {
  const courseName = String(name || '').trim()
  const contest = String(competition || '').trim()
  if (!courseName || !contest) {
    throw new Error('Preencha o nome do curso e o concurso/competição.')
  }

  if (!hasGeminiApiKeys() && !readEnv('VITE_GROQ_API_KEY')) {
    throw new Error('Configure VITE_GEMINI_API_KEY (ou VITE_GROQ_API_KEY) no .env')
  }

  const priceLine =
    price != null && price !== ''
      ? `Preço promocional: R$ ${Number(price).toFixed(2).replace('.', ',')}`
      : ''
  const originalLine =
    originalPrice != null && originalPrice !== ''
      ? `Preço original (riscado): R$ ${Number(originalPrice).toFixed(2).replace('.', ',')}`
      : ''

  const prompt = `Você é copywriter da plataforma FlashConCards (estudos para concursos com flashcards, questões e IA).

Escreva a descrição COMPLETA do curso para o card da loja/home.

DADOS:
- Nome do curso: ${courseName}
- Concurso/cargo: ${contest}
- Banca: ${String(banca || '').trim() || 'não informada'}
${priceLine ? `- ${priceLine}` : ''}
${originalLine ? `- ${originalLine}` : ''}

REGRAS:
- Português do Brasil
- Texto COMPLETO: 3 a 6 frases (cerca de 450 a 900 caracteres)
- Destacar preparação prática (flashcards, questões, material e IA)
- Mencionar o concurso/cargo de forma natural
- Tom profissional e motivador, sem emoji
- NÃO inventar datas de edital, número de vagas ou banca se não foi informada
- NÃO use JSON, markdown, título, aspas envolvendo o texto, nem "Descrição:"
- Retorne SOMENTE o parágrafo(s) da descrição, do início ao fim, sem cortar a última frase`

  let description = ''
  let finishReason = null

  if (hasGeminiApiKeys()) {
    try {
      const response = await callGeminiWithRetry(prompt, {
        // NUNCA silent:true aqui — appendSilentJsonRules quebra texto corrido
        silent: false,
        verifyContent: false,
        useRAG: false,
        useGoogleSearch: false,
        isLegalContent: false,
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.5,
        },
      })
      finishReason = response?.candidates?.[0]?.finishReason || null
      description = cleanDescription(extractGeneratedText(response))
    } catch (err) {
      const groqKey = readEnv('VITE_GROQ_API_KEY')
      if (!groqKey) throw err
      description = cleanDescription(await callGroqFallback(prompt, groqKey))
    }
  } else {
    description = cleanDescription(await callGroqFallback(prompt, readEnv('VITE_GROQ_API_KEY')))
  }

  if (finishReason === 'MAX_TOKENS' && description) {
    // tenta completar se truncou
    try {
      const cont = await callGeminiWithRetry(
        `Complete a descrição abaixo a partir de onde parou, sem repetir o que já existe. Retorne APENAS a continuação em texto corrido.\n\nTEXTO ATÉ AGORA:\n${description}`,
        {
          silent: false,
          verifyContent: false,
          useRAG: false,
          useGoogleSearch: false,
          isLegalContent: false,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
        },
      )
      const more = cleanDescription(extractGeneratedText(cont))
      if (more) description = `${description} ${more}`.replace(/\s+/g, ' ').trim()
    } catch {
      // mantém o que já tem
    }
  }

  if (!description || description.length < 80) {
    throw new Error('A IA retornou uma descrição incompleta. Tente novamente.')
  }

  // Garante pontuação final
  if (!/[.!?…]$/.test(description)) {
    description = `${description}.`
  }

  return description
}

async function callGroqFallback(prompt, groqApiKey) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 1200,
    }),
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `Groq API error: ${response.status}`)
  }
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

async function fetchBrandLogoDataUrl() {
  const candidates = ['/course-icons/logo.png', '/course-icons/logosite.png']
  for (const url of candidates) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) continue
      return await blobToDataUrl(blob)
    } catch {
      // next
    }
  }
  return null
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function fetchRemoteImageDataUrl(url) {
  const res = await fetch('/api/fetch-remote-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.dataUrl) {
    throw new Error(data.error || `Não foi possível baixar: ${url}`)
  }
  return { dataUrl: data.dataUrl, officialHint: Boolean(data.officialHint), sourceUrl: url }
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Falha ao carregar imagem'))
    img.src = dataUrl
  })
}

function drawCoverContain(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)
}

function drawCoverFill(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.restore()
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

/** Extrai sigla curta para o banner (ex.: PMAL → PM AL). */
function buildBannerHeadline(title = '', subtitle = '') {
  const source = `${title} ${subtitle}`.toUpperCase()
  const known = source.match(
    /\b(PM|PC|BM|GCM|CBM|PRF|PF|PFN)[\s-]?([A-Z]{2}|AL|GO|SP|RJ|MG|BA|PE|CE|PR|RS|SC|DF|ES|PB|RN|PI|MA|PA|AM|RO|AC|RR|AP|TO|MT|MS|SE)\b/,
  )
  if (known) {
    return { left: known[1], right: known[2], full: `${known[1]} ${known[2]}`, acronym: `${known[1]}${known[2]}` }
  }
  const acronym = source.match(/\b([A-Z]{3,6})\b/)
  if (acronym) {
    const a = acronym[1]
    if (a.length === 4) {
      return { left: a.slice(0, 2), right: a.slice(2), full: `${a.slice(0, 2)} ${a.slice(2)}`, acronym: a }
    }
    return {
      left: a.slice(0, Math.ceil(a.length / 2)),
      right: a.slice(Math.ceil(a.length / 2)),
      full: a,
      acronym: a,
    }
  }
  const words = String(title || subtitle)
    .replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length >= 2) {
    const full = words.slice(0, 2).join(' ').toUpperCase()
    return {
      left: words[0].slice(0, 8).toUpperCase(),
      right: words[1].slice(0, 8).toUpperCase(),
      full,
      acronym: full.replace(/\s+/g, '').slice(0, 6),
    }
  }
  const one = (title || subtitle || 'CURSO').slice(0, 12).toUpperCase()
  return {
    left: one.slice(0, Math.ceil(one.length / 2)),
    right: one.slice(Math.ceil(one.length / 2)),
    full: one,
    acronym: one.replace(/\s+/g, '').slice(0, 6),
  }
}

function inferInstitutionKind(text = '') {
  const t = text.toLowerCase()
  if (/bombeiro|cbm|corpo de bombeiros/.test(t)) return 'fire department / bombeiros'
  if (/guarda municipal|gcm/.test(t)) return 'municipal guard'
  if (/pol[ií]cia civil|\bpc\b/.test(t)) return 'civil police'
  if (/pol[ií]cia federal|\bpf\b|prf/.test(t)) return 'federal police'
  if (/pol[ií]cia militar|\bpm\b|soldado|oficial/.test(t)) return 'military police'
  if (/tribunal|trt|trf|tse|tre/.test(t)) return 'court / judiciary'
  return 'Brazilian public service / civil service institution'
}

/**
 * Template Louvart-style — só troca órgão/cargo. Sem watermark/URL.
 * Quando há emblema oficial anexado, a IA NÃO inventa brasão.
 */
export function buildCourseCoverSystemPrompt({
  name,
  competition,
  banca = '',
  hasOfficialEmblem = false,
} = {}) {
  const courseName = String(name || '').trim()
  const contest = String(competition || '').trim()
  const board = String(banca || '').trim()
  const headline = buildBannerHeadline(contest, courseName)
  const kind = inferInstitutionKind(`${contest} ${courseName}`)

  const emblemBlock = hasOfficialEmblem
    ? `OFFICIAL EMBLEM (CRITICAL):
- An official emblem/logo image is ATTACHED.
- Place THAT EXACT emblem as the centered hero. Do NOT redraw, reinvent, or "improve" the heraldry.
- Keep colors, ribbons, text and symbols of the attached emblem intact and recognizable.
- You may only adjust lighting/background around it (studio dark backdrop, soft glow).`
    : `EMBLEM:
- Prefer the REAL well-known official emblem of "${contest}" if you know it accurately.
- If unsure, use a clean generic premium seal for a ${kind} — NEVER invent a wrong state coat of arms.`

  return `You are a senior art director for premium Brazilian "concurso público" education brands (quality bar: Louvart / high-end academy posters).

Create ONE 16:9 landscape cover image.

VARIABLES (replace only these — keep the design system fixed):
- COMPETITION / INSTITUTION: "${contest}"
- COURSE / ROLE: "${courseName}"
- SHORT HEADLINE: "${headline.full}"
- INSTITUTION TYPE: ${kind}
${board ? `- EXAMINING BOARD (context only, do NOT print the board name): ${board}` : ''}

${emblemBlock}

DESIGN SYSTEM (mandatory):
1) Minimalist hierarchy. One focus: the official emblem, large and centered (like product photography of a metallic badge).
2) Background: deep charcoal/black studio, soft radial glow behind the emblem, dramatic rim light, HD finish.
3) Typography: modern clean sans-serif only. Keep text minimal — the emblem already carries identity.
   - Optional small gold "CONCURSO" above
   - Optional short white headline "${headline.full}" below only if it does not clutter
4) Extreme negative space. No collage. No crowds. No UI chrome.

STRICT PROHIBITIONS:
- NO watermarks / URLs / QR codes
- NO platform logos (FlashConCards, Louvart, DSO, etc.)
- NO fake/wrong institutional logos
- NO sticker clutter / stock collage look

Quality bar: official premium academy cover, studio render, safe for object-cover cropping.

Output a single polished poster-quality image.`
}

function extractImageDataUrl(response) {
  const parts = response?.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png'
      return `data:${mime};base64,${inline.data}`
    }
  }
  return null
}

function splitDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return null
  return { mimeType: m[1], data: m[2] }
}

async function compressDataUrl(dataUrl, { maxBytes = 1.95 * 1024 * 1024, maxSide = 1920 } = {}) {
  if (!dataUrl || typeof document === 'undefined') return dataUrl

  const img = await loadImage(dataUrl)
  let { width, height } = img
  const scale = Math.min(1, maxSide / Math.max(width, height))
  width = Math.max(1, Math.round(width * scale))
  height = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  let quality = 0.92
  let out = canvas.toDataURL('image/jpeg', quality)
  while (out.length > maxBytes * 1.37 && quality > 0.58) {
    quality -= 0.06
    out = canvas.toDataURL('image/jpeg', quality)
  }
  return out
}

async function generateStudioCoverWithGemini({ name, competition, banca, emblemDataUrl = null }) {
  if (!hasGeminiApiKeys()) {
    throw new Error('VITE_GEMINI_API_KEY necessária para gerar capa profissional.')
  }

  const hasOfficialEmblem = Boolean(emblemDataUrl && splitDataUrl(emblemDataUrl))
  const prompt = buildCourseCoverSystemPrompt({
    name,
    competition,
    banca,
    hasOfficialEmblem,
  })

  const parts = [{ text: prompt }]
  if (hasOfficialEmblem) {
    const { mimeType, data } = splitDataUrl(emblemDataUrl)
    parts.push({
      inlineData: { mimeType: mimeType || 'image/png', data },
    })
  }

  const { data } = await geminiRequestWithKeyFallback({
    models: IMAGE_MODELS,
    silent: false,
    buildBody: () => ({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        temperature: 0.25,
      },
    }),
  })

  const dataUrl = extractImageDataUrl(data)
  if (!dataUrl) {
    throw new Error('A IA não retornou imagem. Verifique acesso aos modelos de imagem Gemini.')
  }
  return compressDataUrl(dataUrl)
}

/**
 * Capa estilo referência Louvart/PCGO: brasão REAL centralizado em fundo estúdio.
 * Sem watermark, sem URL, sem inventar logo.
 */
async function composeMinimalStudioCover({
  emblemDataUrl,
  title,
  subtitle,
}) {
  const W = 1920
  const H = 1080
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const headline = buildBannerHeadline(title, subtitle)
  const emblem = emblemDataUrl ? await loadImage(emblemDataUrl).catch(() => null) : null

  // fundo charcoal como na referência
  const bg = ctx.createRadialGradient(W / 2, H * 0.48, 40, W / 2, H / 2, H * 0.72)
  bg.addColorStop(0, '#2a2a2e')
  bg.addColorStop(0.4, '#141416')
  bg.addColorStop(1, '#050506')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // glow de estúdio atrás do emblema
  const spot = ctx.createRadialGradient(W / 2, H * 0.46, 30, W / 2, H * 0.46, 380)
  spot.addColorStop(0, 'rgba(255,255,255,0.14)')
  spot.addColorStop(0.45, 'rgba(212,175,55,0.06)')
  spot.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = spot
  ctx.fillRect(0, 0, W, H)

  if (emblem) {
    // Emblema oficial grande e central — prioridade absoluta
    const maxW = W * 0.42
    const maxH = H * 0.72
    const scale = Math.min(maxW / emblem.width, maxH / emblem.height)
    const dw = emblem.width * scale
    const dh = emblem.height * scale
    const dx = (W - dw) / 2
    const dy = (H - dh) / 2 - H * 0.02
    ctx.drawImage(emblem, dx, dy, dw, dh)

    // subtítulo discreto só se o cargo for diferente do concurso
    const sub = String(subtitle || '').trim()
    if (sub && sub.toUpperCase() !== String(title || '').toUpperCase()) {
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(226,232,240,0.75)'
      ctx.font = '500 28px Inter, Segoe UI, Arial, sans-serif'
      const lines = wrapText(ctx, sub, W * 0.55)
      let y = dy + dh + 48
      for (const line of lines.slice(0, 1)) {
        ctx.fillText(line, W / 2, y)
        y += 36
      }
      ctx.textAlign = 'left'
    }
  } else {
    // sem logo real: tipografia mínima (último recurso)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#f5c518'
    ctx.font = '700 42px Inter, Segoe UI, Arial, sans-serif'
    ctx.fillText('CONCURSO', W / 2, H * 0.38)
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 88px Inter, Segoe UI, Arial, sans-serif'
    ctx.fillText(headline.full, W / 2, H * 0.52)
    ctx.textAlign = 'left'
  }

  return compressDataUrl(canvas.toDataURL('image/jpeg', 0.94))
}

async function fetchOfficialEmblemDataUrl({ name, competition, banca, referenceLink }) {
  try {
    const res = await fetch('/api/course-cover-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        competition,
        banca,
        referenceLink,
        preferLogo: true,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      return data.logo?.dataUrl || data.photo?.dataUrl || null
    }
    console.warn('[courseCover] emblema oficial:', data.error || res.status)
  } catch (err) {
    console.warn('[courseCover] emblema oficial falhou:', err?.message || err)
  }

  // fallback cliente
  try {
    const { logoCandidates, photoCandidates } = await resolveInstitutionImages({
      name,
      competition,
      banca,
      referenceLink,
    })
    const logo = await downloadFirstWorking(logoCandidates, { preferOfficial: true, maxTries: 10 })
    if (logo?.dataUrl) return logo.dataUrl
    const photo = await downloadFirstWorking(photoCandidates, { preferOfficial: true, maxTries: 6 })
    return photo?.dataUrl || null
  } catch (err) {
    console.warn('[courseCover] fallback emblema:', err?.message || err)
    return null
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function toCandidate(url, title = '') {
  if (!url || !/^https?:\/\//i.test(url)) return null
  const clean = String(url).replace(/[),.;]+$/g, '').trim()
  return {
    link: clean,
    displayLink: hostOf(clean),
    title,
  }
}

function extractImageUrlsFromText(text = '') {
  const urls = String(text).match(/https?:\/\/[^\s"'<>\\]+/gi) || []
  const out = []
  const seen = new Set()
  for (const raw of urls) {
    const u = raw.replace(/[),.;]+$/g, '')
    if (seen.has(u)) continue
    const looksImage =
      /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u) ||
      /googleusercontent\.com|ggpht\.com|wikimedia\.org|wikipedia\.org|\.gov\.br|\.mil\.br/i.test(u)
    if (!looksImage) continue
    seen.add(u)
    out.push(u)
  }
  return out
}

async function findOfficialImageUrlsWithGemini(contest, { banca = '', referenceLink = '' } = {}) {
  if (!hasGeminiApiKeys()) return { logos: [], photos: [] }

  const prompt = `Use a busca do Google e encontre imagens REAIS e OFICIAIS (não invente URLs).

Instituição/concurso: "${contest}"
${banca ? `Banca: ${banca}` : ''}
${referenceLink ? `Site de referência: ${referenceLink}` : ''}

Preciso de:
1) logo ou brasão OFICIAL da instituição (arquivo de imagem público)
2) fotos REAIS da sede/quartel/unidade OU pessoal em solenidade/formatura (não stock genérico)

Priorize .gov.br / sites oficiais.
Retorne APENAS JSON válido:
{
  "logoUrls": ["https://...png", "https://..."],
  "photoUrls": ["https://...jpg", "https://..."]
}

Regras:
- Só URLs que existam de verdade na web
- Links diretos de imagem quando possível
- Se não achar, arrays vazios — NÃO invente`

  const response = await callGeminiWithRetry(prompt, {
    silent: true,
    verifyContent: false,
    useRAG: false,
    useGoogleSearch: true,
    isLegalContent: false,
    generationConfig: { maxOutputTokens: 2048, temperature: 0.1 },
  })

  const raw = extractGeneratedText(response)
  const jsonText = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  let parsed = {}
  try {
    parsed = JSON.parse(jsonText.match(/\{[\s\S]*\}/)?.[0] || '{}')
  } catch {
    // tenta extrair URLs cruas do texto
    const urls = extractImageUrlsFromText(raw)
    return {
      logos: urls.slice(0, 2).map((u) => toCandidate(u, 'logo')).filter(Boolean),
      photos: urls.slice(2, 6).map((u) => toCandidate(u, 'photo')).filter(Boolean),
    }
  }

  const logos = (parsed.logoUrls || [parsed.logoUrl]).map((u) => toCandidate(u, 'logo')).filter(Boolean)
  const photos = (parsed.photoUrls || [parsed.photoUrl]).map((u) => toCandidate(u, 'photo')).filter(Boolean)
  return { logos, photos }
}

/** Busca Google via Jina (sem Custom Search API) e extrai URLs de imagem. */
async function findImageUrlsViaGoogleWeb(query) {
  const q = encodeURIComponent(query)
  const endpoints = [
    `https://r.jina.ai/http://www.google.com/search?tbm=isch&hl=pt-BR&q=${q}`,
    `https://r.jina.ai/http://www.google.com/search?hl=pt-BR&q=${q}+logo+oficial`,
  ]
  const found = []
  for (const url of endpoints) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const text = await res.text()
      found.push(...extractImageUrlsFromText(text))
      if (found.length >= 4) break
    } catch (err) {
      console.warn('Google web search via Jina falhou:', err?.message || err)
    }
  }
  return [...new Set(found)].slice(0, 8).map((u) => toCandidate(u, query)).filter(Boolean)
}

async function resolveInstitutionImages({ name, competition, banca, referenceLink }) {
  const contest = String(competition || name || '').trim()
  let logoCandidates = []
  let photoCandidates = []

  // 1) Principal: Gemini + Google Search grounding (não precisa Custom Search API)
  try {
    const gem = await findOfficialImageUrlsWithGemini(contest, { banca, referenceLink })
    logoCandidates.push(...gem.logos)
    photoCandidates.push(...gem.photos)
  } catch (err) {
    console.warn('Gemini Google Search grounding falhou:', err?.message || err)
  }

  // 2) Busca web direta (Google via Jina) — sem chave CSE
  if (logoCandidates.length < 1 || photoCandidates.length < 1) {
    const webLogo = await findImageUrlsViaGoogleWeb(`${contest} logo oficial brasão site:gov.br`)
    const webPhoto = await findImageUrlsViaGoogleWeb(`${contest} sede OR quartel OR solenidade foto oficial`)
    if (logoCandidates.length < 1) logoCandidates.push(...webLogo)
    if (photoCandidates.length < 1) photoCandidates.push(...webPhoto)
  }

  // 3) Opcional: Custom Search API se estiver configurada
  const hasCse = Boolean(
    readEnv('VITE_GOOGLE_SEARCH_API_KEY') && readEnv('VITE_GOOGLE_SEARCH_ENGINE_ID'),
  )
  if (hasCse && (logoCandidates.length < 2 || photoCandidates.length < 2)) {
    try {
      let refHost = ''
      try {
        if (referenceLink) refHost = new URL(referenceLink).hostname
      } catch {
        refHost = ''
      }

      const logoQueries = [
        { q: `${contest} logo oficial brasão`, imgType: 'clipart', fileType: 'png' },
        { q: `${contest} brasão oficial`, imgType: 'photo' },
      ]
      const photoQueries = [
        { q: `${contest} sede oficial foto`, imgType: 'photo', imgSize: 'large' },
        { q: `${contest} formatura OR solenidade foto`, imgType: 'photo', imgSize: 'large' },
      ]

      for (const item of logoQueries) {
        const found = await googleImageSearch(item.q, {
          numResults: 5,
          imgType: item.imgType,
          fileType: item.fileType,
          ...(refHost ? { siteSearch: refHost } : {}),
        })
        logoCandidates.push(...found)
      }
      for (const item of photoQueries) {
        const found = await googleImageSearch(item.q, {
          numResults: 5,
          imgType: item.imgType,
          imgSize: item.imgSize,
        })
        photoCandidates.push(...found)
      }
    } catch (err) {
      console.warn('Custom Search opcional falhou:', err?.message || err)
    }
  }

  // 4) Se tiver link de referência, tenta og:image / imagens da página
  if (referenceLink && (logoCandidates.length < 1 || photoCandidates.length < 1)) {
    try {
      const page = await fetch(`https://r.jina.ai/${referenceLink}`)
      if (page.ok) {
        const text = await page.text()
        const urls = extractImageUrlsFromText(text).map((u) => toCandidate(u, 'ref'))
        if (logoCandidates.length < 1) logoCandidates.push(...urls.slice(0, 2))
        if (photoCandidates.length < 1) photoCandidates.push(...urls.slice(0, 4))
      }
    } catch {
      // ignore
    }
  }

  logoCandidates = rankOfficialImageResults(logoCandidates.filter(Boolean))
  photoCandidates = rankOfficialImageResults(photoCandidates.filter(Boolean))

  return { logoCandidates, photoCandidates }
}

async function downloadFirstWorking(candidates, { preferOfficial = true, maxTries = 5 } = {}) {
  const list = preferOfficial
    ? [
        ...candidates.filter((c) => isLikelyOfficialDomain(c.displayLink)),
        ...candidates.filter((c) => !isLikelyOfficialDomain(c.displayLink)),
      ]
    : candidates

  const seen = new Set()
  let tries = 0
  for (const item of list) {
    const url = item.link
    if (!url || seen.has(url)) continue
    seen.add(url)
    tries += 1
    if (tries > maxTries) break
    try {
      const downloaded = await fetchRemoteImageDataUrl(url)
      return { ...downloaded, meta: item }
    } catch (err) {
      console.warn('Skip image', url, err?.message || err)
    }
  }
  return null
}

/**
 * Capa profissional estilo Louvart com LOGO REAL do órgão:
 * 1) Busca brasão/logo oficial
 * 2) Monta capa estúdio com o emblema real (pixel-perfect)
 * 3) Opcional: Gemini só para polish, sempre com o emblema anexado
 */
export async function generateCourseCoverImageAi({
  name,
  competition,
  banca = '',
  price,
  referenceLink = '',
} = {}) {
  const courseName = String(name || '').trim()
  const contest = String(competition || '').trim()
  if (!courseName || !contest) {
    throw new Error('Preencha o nome do curso e o concurso/competição.')
  }

  void price

  // 1) Logo/brasão REAL primeiro (ex.: PCGO)
  const emblemDataUrl = await fetchOfficialEmblemDataUrl({
    name: courseName,
    competition: contest,
    banca,
    referenceLink,
  })

  if (emblemDataUrl) {
    // Composição com emblema oficial = garantia de logo real
    return composeMinimalStudioCover({
      emblemDataUrl,
      title: contest,
      subtitle: courseName !== contest ? courseName : '',
    })
  }

  // 2) Sem emblema baixado: tenta Gemini (pode errar brasões — último recurso)
  try {
    return await generateStudioCoverWithGemini({
      name: courseName,
      competition: contest,
      banca,
      emblemDataUrl: null,
    })
  } catch (err) {
    console.warn('[courseCover] Gemini Image falhou:', err?.message || err)
  }

  return composeMinimalStudioCover({
    emblemDataUrl: null,
    title: contest,
    subtitle: courseName !== contest ? courseName : '',
  })
}

export function formatCourseAiError(err) {
  return formatAiErrorForUser(err) || err?.message || 'Erro na geração com IA'
}

