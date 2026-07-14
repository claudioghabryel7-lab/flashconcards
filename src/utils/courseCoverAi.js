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
  return lines.slice(0, 4)
}

/** Extrai sigla curta para o banner (ex.: PMAL → PM AL). */
function buildBannerHeadline(title = '', subtitle = '') {
  const source = `${title} ${subtitle}`.toUpperCase()
  const known = source.match(
    /\b(PM|PC|PP|BM|GCM|CBM|PRF|PF|PFN|PPRN|PCGO)[\s-]?([A-Z]{2}|AL|GO|SP|RJ|MG|BA|PE|CE|PR|RS|SC|DF|ES|PB|RN|PI|MA|PA|AM|RO|AC|RR|AP|TO|MT|MS|SE)?\b/,
  )
  if (known) {
    const left = known[1]
    const right = known[2] || ''
    // Já veio completo (PPRN, PCGO)
    if (!right && left.length >= 4) {
      return {
        left: left.slice(0, 2),
        right: left.slice(2),
        full: left,
        acronym: left,
      }
    }
    return {
      left,
      right,
      full: right ? `${left} ${right}` : left,
      acronym: `${left}${right}`,
    }
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
  if (/pol[ií]cia penal|\bpp\b|pprn/.test(t)) return 'prison police / polícia penal'
  if (/bombeiro|cbm|corpo de bombeiros/.test(t)) return 'fire department / bombeiros'
  if (/guarda municipal|gcm/.test(t)) return 'municipal guard'
  if (/pol[ií]cia civil|\bpc\b/.test(t)) return 'civil police'
  if (/pol[ií]cia federal|\bpf\b|prf/.test(t)) return 'federal police'
  if (/pol[ií]cia militar|\bpm\b|soldado|oficial/.test(t)) return 'military police'
  if (/tribunal|trt|trf|tse|tre/.test(t)) return 'court / judiciary'
  return 'Brazilian public service / civil service institution'
}

/**
 * Textos da capa = mesmos campos do admin (nome + concurso).
 * Ex.: nome "PPRN" + concurso "Polícia Penal Rio Grande do Norte"
 */
function resolveCoverTexts(name = '', competition = '') {
  const courseName = String(name || '').trim()
  const contest = String(competition || '').trim()
  const shortName =
    courseName &&
    (courseName.length <= 14 || /^[A-Z0-9]{2,10}$/i.test(courseName.replace(/\s+/g, '')))

  const headline = shortName
    ? courseName.toUpperCase()
    : buildBannerHeadline(contest, courseName).full || courseName.toUpperCase()

  const institution = contest || courseName
  const subtitle =
    shortName && contest && contest.toUpperCase() !== headline
      ? contest
      : !shortName && courseName && courseName.toUpperCase() !== institution.toUpperCase()
        ? courseName
        : ''

  return { headline, institution, subtitle, courseName, contest }
}

/**
 * Cores/tipografia do site (FlashConCards / Concurseiro Preditivo — modo dark tech).
 */
const SITE_COVER = {
  bg: '#09090b',
  text: '#fafafa',
  muted: '#a1a1aa',
  accent: '#a78bfa',
  accent2: '#22d3ee',
  accent3: '#f472b6',
  aurora1: 'rgba(124, 58, 237, 0.28)',
  aurora2: 'rgba(34, 211, 238, 0.18)',
  aurora3: 'rgba(244, 114, 182, 0.14)',
  gridDot: 'rgba(167, 139, 250, 0.16)',
}

function getSiteFonts() {
  if (typeof document === 'undefined') {
    return {
      display: 'Syne, system-ui, sans-serif',
      sans: 'system-ui, sans-serif',
      mono: 'ui-monospace, monospace',
    }
  }
  const root = getComputedStyle(document.documentElement)
  return {
    display: root.getPropertyValue('--font-display').trim() || 'Syne, system-ui, sans-serif',
    sans: root.getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif',
    mono: root.getPropertyValue('--font-mono').trim() || 'ui-monospace, monospace',
  }
}

async function ensureSiteFonts() {
  if (typeof document === 'undefined') return getSiteFonts()
  try {
    await Promise.all([
      document.fonts.load(`700 64px Syne`),
      document.fonts.load(`600 40px Syne`),
      document.fonts.ready,
    ])
  } catch {
    // segue com fallback do sistema
  }
  return getSiteFonts()
}

/** Fundo tech do site: zinc escuro + aurora violeta/ciano/rosa + dot grid. */
function drawTechSiteBackground(ctx, W, H) {
  ctx.fillStyle = SITE_COVER.bg
  ctx.fillRect(0, 0, W, H)

  const a1 = ctx.createRadialGradient(W * 0.18, H * 0.12, 0, W * 0.18, H * 0.12, W * 0.55)
  a1.addColorStop(0, SITE_COVER.aurora1)
  a1.addColorStop(1, 'transparent')
  ctx.fillStyle = a1
  ctx.fillRect(0, 0, W, H)

  const a2 = ctx.createRadialGradient(W * 0.88, H * 0.22, 0, W * 0.88, H * 0.22, W * 0.45)
  a2.addColorStop(0, SITE_COVER.aurora2)
  a2.addColorStop(1, 'transparent')
  ctx.fillStyle = a2
  ctx.fillRect(0, 0, W, H)

  const a3 = ctx.createRadialGradient(W * 0.4, H * 0.92, 0, W * 0.4, H * 0.92, W * 0.5)
  a3.addColorStop(0, SITE_COVER.aurora3)
  a3.addColorStop(1, 'transparent')
  ctx.fillStyle = a3
  ctx.fillRect(0, 0, W, H)

  // dot grid (cp-dot-grid)
  const step = Math.max(18, Math.round(W / 90))
  ctx.fillStyle = SITE_COVER.gridDot
  for (let x = step; x < W; x += step) {
    for (let y = step; y < H; y += step) {
      ctx.beginPath()
      ctx.arc(x, y, 1.1, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // vinheta central → borda (igual TechBackground)
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.78)
  vignette.addColorStop(0, 'transparent')
  vignette.addColorStop(1, SITE_COVER.bg)
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)
}

/**
 * Template tipográfico no visual tech do site (Syne / Geist / aurora).
 * Subtítulo longo do concurso NÃO é gerado pela IA — aplicado depois em fonte real.
 */
export function buildCourseCoverSystemPrompt({
  name,
  competition,
  banca = '',
} = {}) {
  const texts = resolveCoverTexts(name, competition)
  void competition
  void banca

  return `You are the brand art director for FlashConCards / Concurseiro Preditivo (Brazilian concurso study platform).

Create ONE 16:9 landscape cover image that matches the SITE visual system.

BRAND LOOK (mandatory — copy the product UI):
- Dark tech background like zinc-950 (#09090b)
- Soft aurora glows: violet (#7c3aed), cyan (#22d3ee), pink (#f472b6) — same as the site TechBackground
- Subtle purple/violet DOT GRID overlay (tech dashboard feel)
- Soft center vignette
- Premium SaaS / edtech aesthetic — NOT gold classical academic, NOT stock photo

TYPOGRAPHY (site fonts):
- Eyebrow "PREPARAÇÃO": small, uppercase, letter-spaced, cyan/violet tech accent, mono/tech label style (Geist Mono vibe)
- Headline "${texts.headline}": huge, bold, white (#fafafa), geometric display sans like Syne — centered hero
- Sharp, modern, product-UI typography — NOT serif, NOT decorative script

VARIABLES (print EXACTLY):
- EYEBROW: "PREPARAÇÃO"
- HEADLINE: "${texts.headline}"

CRITICAL — DO NOT RENDER ANY OTHER TEXT:
- Do NOT print institution/role long sentences (added later in post with real site fonts)
- Leave the lower ~35% mostly empty (clean tech background)

STRICT PROHIBITIONS:
- NO brasão / logo / badge / shield / coat of arms
- NO watermarks / URLs / QR / platform wordmarks
- NO people, vehicles, buildings, collage
- NO cream/paper/classic gold "concurso poster" look — must feel like the dark tech site
- Do NOT invent another acronym instead of "${texts.headline}"

Output a single polished 16:9 cover.`
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

/** Desenha o texto do concurso com fontes do site (Geist / Syne). */
async function overlayCompetitionSubtitle(dataUrl, { name, competition }) {
  if (!dataUrl || typeof document === 'undefined') return dataUrl

  const fonts = await ensureSiteFonts()
  const texts = resolveCoverTexts(name, competition)
  const sub = String(texts.subtitle || texts.institution || '').trim()
  const hl = texts.headline
  if (!sub || sub.toUpperCase() === hl) return dataUrl

  const img = await loadImage(dataUrl)
  const W = img.width
  const H = img.height
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, W, H)

  const bandTop = H * 0.58
  const fade = ctx.createLinearGradient(0, bandTop - H * 0.06, 0, H)
  fade.addColorStop(0, 'rgba(9,9,11,0)')
  fade.addColorStop(0.3, 'rgba(9,9,11,0.75)')
  fade.addColorStop(1, 'rgba(9,9,11,0.94)')
  ctx.fillStyle = fade
  ctx.fillRect(0, bandTop - H * 0.06, W, H - bandTop + H * 0.06)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = SITE_COVER.muted

  let fontSize = Math.round(H * 0.03)
  if (sub.length > 48) fontSize = Math.round(H * 0.026)
  if (sub.length > 72) fontSize = Math.round(H * 0.022)
  ctx.font = `500 ${fontSize}px ${fonts.sans}`

  const maxWidth = W * 0.78
  const lines = wrapText(ctx, sub, maxWidth)
  const lineGap = Math.round(fontSize * 1.4)
  const blockH = lines.length * lineGap
  let y = H * 0.72 - blockH / 2 + lineGap / 2
  for (const line of lines) {
    ctx.fillText(line, W / 2, y)
    y += lineGap
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  return compressDataUrl(canvas.toDataURL('image/jpeg', 0.92))
}

async function generateStudioCoverWithGemini({ name, competition, banca }) {
  if (!hasGeminiApiKeys()) {
    throw new Error('VITE_GEMINI_API_KEY necessária para gerar capa profissional.')
  }

  const prompt = buildCourseCoverSystemPrompt({
    name,
    competition,
    banca,
  })

  const { data } = await geminiRequestWithKeyFallback({
    models: IMAGE_MODELS,
    silent: false,
    buildBody: () => ({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        temperature: 0.3,
      },
    }),
  })

  const dataUrl = extractImageDataUrl(data)
  if (!dataUrl) {
    throw new Error('A IA não retornou imagem. Verifique acesso aos modelos de imagem Gemini.')
  }

  const compressed = await compressDataUrl(dataUrl)
  return overlayCompetitionSubtitle(compressed, { name, competition })
}

/**
 * Capa tipográfica com fundo tech + fontes do site (Syne / Geist / Geist Mono).
 */
async function composeMinimalStudioCover({
  name,
  competition,
}) {
  const fonts = await ensureSiteFonts()
  const W = 1920
  const H = 1080
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const texts = resolveCoverTexts(name, competition)
  drawTechSiteBackground(ctx, W, H)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // PREPARAÇÃO — label mono do site (tracking largo, accent cyan)
  ctx.fillStyle = SITE_COVER.accent2
  ctx.font = `600 42px ${fonts.mono}`
  const prep = 'PREPARAÇÃO'
  // letter-spacing manual (canvas não aplica CSS letter-spacing de forma confiável)
  const prepSize = 42
  ctx.font = `600 ${prepSize}px ${fonts.mono}`
  const spacing = 10
  let prepWidth = 0
  for (const ch of prep) prepWidth += ctx.measureText(ch).width + spacing
  prepWidth -= spacing
  let px = W / 2 - prepWidth / 2
  for (const ch of prep) {
    ctx.fillText(ch, px + ctx.measureText(ch).width / 2, H * 0.28)
    px += ctx.measureText(ch).width + spacing
  }

  // Headline — Syne (font-display do site)
  ctx.fillStyle = SITE_COVER.text
  const hl = texts.headline
  let headlineSize = 168
  if (hl.length > 8) headlineSize = 128
  if (hl.length > 14) headlineSize = 96
  if (hl.length > 22) headlineSize = 72
  ctx.font = `700 ${headlineSize}px ${fonts.display}`
  ctx.fillText(hl, W / 2, H * 0.48)

  // Subtítulo — Geist sans
  const sub = texts.subtitle || texts.institution || ''
  if (sub && sub.toUpperCase() !== hl) {
    ctx.fillStyle = SITE_COVER.muted
    let fontSize = 34
    if (sub.length > 48) fontSize = 30
    if (sub.length > 72) fontSize = 26
    ctx.font = `500 ${fontSize}px ${fonts.sans}`
    const lines = wrapText(ctx, sub, W * 0.78)
    const lineGap = Math.round(fontSize * 1.4)
    let y = H * 0.66
    for (const line of lines) {
      ctx.fillText(line, W / 2, y)
      y += lineGap
    }
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  return compressDataUrl(canvas.toDataURL('image/jpeg', 0.92))
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
 * Capa tipográfica no visual tech do site:
 * fundo aurora + dot grid + fontes Syne / Geist / Geist Mono.
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
  void referenceLink
  void banca

  // Primário: canvas com tokens/fontes do site (fiel ao produto)
  try {
    return await composeMinimalStudioCover({
      name: courseName,
      competition: contest,
    })
  } catch (err) {
    console.warn('[courseCover] composição tech falhou, tentando Gemini:', err?.message || err)
  }

  return generateStudioCoverWithGemini({
    name: courseName,
    competition: contest,
    banca,
  })
}

export function formatCourseAiError(err) {
  return formatAiErrorForUser(err) || err?.message || 'Erro na geração com IA'
}

