/**
 * Mídia visual/textual opcional por tipo de matéria.
 * NÃO substitui prompts de geração — só um apêndice curto quando a disciplina pede.
 *
 * - Matemática / biologia (cálculo): gráficos/contas SVG pré-definidos
 * - História / geografia: imagens https públicas
 * - Português (interpretação): texto-base quando a questão exigir
 */

const CALC_RE =
  /matem[aá]tic|estat[ií]stic|racioc[ií]nio\s*l[oó]gic|raciocinio\s*logic|quantitativ|f[ií]sic|qu[ií]mic|biolog|ecologia|gen[eé]tic|anatom|fisiolog|geometr|[aá]lgebra|trigonometr|probabilidad|combinat[oó]ria|c[aá]lculo|aritm[eé]tic|finan[cç]/

const IMAGE_RE = /hist[oó]ri|geograf|geopol[ií]tic|atualidades/

const PORTUGUES_RE = /portugu[eê]s|lingua\s*portuguesa|língua\s*portuguesa|interpreta[cç][aã]o|compreens[aã]o\s*de\s*texto|redac[aã]o|literatura/

/** Presets SVG (sem gerar imagem por IA). */
export const STEM_ILLUSTRATION_PRESETS = [
  { id: 'barras', tipo: 'grafico', desc: 'Barras: labels[] + valores[]' },
  { id: 'linha', tipo: 'grafico', desc: 'Linha: labels[] + valores[]' },
  { id: 'pizza', tipo: 'grafico', desc: 'Pizza: labels[] + valores[]' },
  { id: 'eixos', tipo: 'grafico', desc: 'Eixos: pontos[{x,y}] / segmentos' },
  { id: 'conta', tipo: 'conta', desc: 'Conta em passos: passos[]' },
  { id: 'tabela', tipo: 'diagrama', desc: 'Tabela: cabecalhos[] + linhas[][]' },
  { id: 'fluxo', tipo: 'diagrama', desc: 'Fluxo: etapas[]' },
  { id: 'esquema', tipo: 'diagrama', desc: 'Esquema: itens[{rotulo,detalhe}]' },
  { id: 'imagem', tipo: 'imagem', desc: 'URL https pública (Wikimedia etc.)' },
]

function normSubject(disciplina = '', topicoNome = '') {
  return `${disciplina} ${topicoNome}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function needsCalculationVisuals(disciplina = '', topicoNome = '') {
  return CALC_RE.test(normSubject(disciplina, topicoNome))
}

export function needsInternetImages(disciplina = '', topicoNome = '') {
  return IMAGE_RE.test(normSubject(disciplina, topicoNome))
}

export function needsPortugueseSourceText(disciplina = '', topicoNome = '') {
  return PORTUGUES_RE.test(normSubject(disciplina, topicoNome))
}

/** Qualquer matéria que ganha apêndice de mídia. */
export function needsVisualMediaSupport(disciplina = '', topicoNome = '') {
  return (
    needsCalculationVisuals(disciplina, topicoNome) ||
    needsInternetImages(disciplina, topicoNome) ||
    needsPortugueseSourceText(disciplina, topicoNome)
  )
}

/** @deprecated use needsCalculationVisuals / needsVisualMediaSupport */
export function isVisualStemDiscipline(disciplina = '', topicoNome = '') {
  return needsVisualMediaSupport(disciplina, topicoNome)
}

function clampNumber(n, fallback = 0) {
  const v = Number(n)
  return Number.isFinite(v) ? v : fallback
}

function asStringArray(v, max = 12) {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, max)
}

function asNumberArray(v, max = 12) {
  if (!Array.isArray(v)) return []
  return v.map((x) => clampNumber(x, 0)).slice(0, max)
}

function isSafeImageUrl(url = '') {
  try {
    const u = new URL(String(url))
    return u.protocol === 'https:' && Boolean(u.hostname)
  } catch {
    return false
  }
}

/**
 * Normaliza ilustração vinda da IA. Retorna null se inválida/ausente.
 */
export function normalizeIllustration(raw) {
  if (!raw || typeof raw !== 'object') return null

  const preset = String(raw.preset || raw.id || raw.tipoPreset || '')
    .trim()
    .toLowerCase()
  const known = STEM_ILLUSTRATION_PRESETS.find((p) => p.id === preset)
  if (!known && !raw.imageUrl) return null

  const tipo = String(raw.tipo || known?.tipo || 'grafico').trim().toLowerCase()
  const lado = ['pergunta', 'resposta', 'enunciado', 'ambos'].includes(
    String(raw.lado || '').toLowerCase(),
  )
    ? String(raw.lado).toLowerCase()
    : tipo === 'conta'
      ? 'resposta'
      : 'enunciado'

  const paramsIn = raw.params && typeof raw.params === 'object' ? raw.params : {}
  const params = {
    labels: asStringArray(paramsIn.labels || paramsIn.categorias || raw.labels),
    valores: asNumberArray(paramsIn.valores || paramsIn.values || raw.valores),
    unidade: String(paramsIn.unidade || raw.unidade || '').slice(0, 24),
    passos: asStringArray(paramsIn.passos || paramsIn.steps || raw.passos, 16),
    cabecalhos: asStringArray(paramsIn.cabecalhos || paramsIn.headers, 8),
    linhas: Array.isArray(paramsIn.linhas || paramsIn.rows)
      ? (paramsIn.linhas || paramsIn.rows)
          .slice(0, 10)
          .map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? '').slice(0, 40)) : []))
          .filter((row) => row.length)
      : [],
    etapas: asStringArray(paramsIn.etapas || paramsIn.stages, 8),
    itens: Array.isArray(paramsIn.itens || paramsIn.items)
      ? (paramsIn.itens || paramsIn.items)
          .slice(0, 8)
          .map((it) => ({
            rotulo: String(it?.rotulo || it?.label || it || '').slice(0, 48),
            detalhe: String(it?.detalhe || it?.detail || '').slice(0, 80),
          }))
          .filter((it) => it.rotulo)
      : [],
    pontos: Array.isArray(paramsIn.pontos || paramsIn.points)
      ? (paramsIn.pontos || paramsIn.points)
          .slice(0, 12)
          .map((p) => ({
            x: clampNumber(p?.x, 0),
            y: clampNumber(p?.y, 0),
            rotulo: String(p?.rotulo || p?.label || '').slice(0, 20),
          }))
      : [],
    segmentos: Array.isArray(paramsIn.segmentos || paramsIn.segments)
      ? (paramsIn.segmentos || paramsIn.segments)
          .slice(0, 8)
          .map((s) => ({
            x1: clampNumber(s?.x1, 0),
            y1: clampNumber(s?.y1, 0),
            x2: clampNumber(s?.x2, 0),
            y2: clampNumber(s?.y2, 0),
          }))
      : [],
  }

  const imageUrl = isSafeImageUrl(raw.imageUrl) ? String(raw.imageUrl).trim() : null
  const resolvedPreset = known?.id || (imageUrl ? 'imagem' : null)
  if (!resolvedPreset) return null

  if (resolvedPreset === 'barras' || resolvedPreset === 'linha' || resolvedPreset === 'pizza') {
    if (params.valores.length < 2) return null
    if (!params.labels.length) {
      params.labels = params.valores.map((_, i) => String.fromCharCode(65 + i))
    }
  }
  if (resolvedPreset === 'conta' && params.passos.length < 2) return null
  if (resolvedPreset === 'tabela' && (!params.cabecalhos.length || !params.linhas.length)) return null
  if (resolvedPreset === 'fluxo' && params.etapas.length < 2) return null
  if (resolvedPreset === 'esquema' && params.itens.length < 2) return null
  if (resolvedPreset === 'eixos' && !params.pontos.length && !params.segmentos.length) return null
  if (resolvedPreset === 'imagem' && !imageUrl) return null

  return {
    tipo: known?.tipo || tipo,
    preset: resolvedPreset,
    lado,
    titulo: String(raw.titulo || raw.title || '').trim().slice(0, 80) || null,
    caption: String(raw.caption || raw.legenda || '').trim().slice(0, 160) || null,
    imageUrl,
    params,
  }
}

export function normalizeTextoBase(raw) {
  const text = String(raw || '').trim()
  if (text.length < 40) return null
  return text.slice(0, 8000)
}

export function attachNormalizedIllustration(item = {}) {
  if (!item || typeof item !== 'object') return item
  const ilustracao = normalizeIllustration(item.ilustracao || item.illustration || item.figura)
  const ilustracaoResposta = normalizeIllustration(
    item.ilustracaoResposta || item.illustrationBack || item.figuraResposta,
  )
  const textoBase = normalizeTextoBase(
    item.textoBase || item.textoReferencia || item.texto || item.textoApoio,
  )
  const next = { ...item }
  if (ilustracao) next.ilustracao = ilustracao
  else delete next.ilustracao
  if (ilustracaoResposta) next.ilustracaoResposta = ilustracaoResposta
  else delete next.ilustracaoResposta
  if (textoBase) next.textoBase = textoBase
  else delete next.textoBase
  return next
}

/**
 * Apêndice curto anexado AO FINAL do prompt já pronto.
 * Se a disciplina não precisa, devolve o prompt intacto.
 */
export function appendVisualMediaAppendix(prompt = '', disciplina = '', topicoNome = '', kind = 'questoes') {
  const base = String(prompt || '')
  if (!needsVisualMediaSupport(disciplina, topicoNome)) return base

  const parts = []

  if (needsCalculationVisuals(disciplina, topicoNome)) {
    parts.push(`MÍDIA OPCIONAL (só nesta matéria de cálculo/STEM — NÃO mude o formato JSON principal):
- Em ~20–35% dos itens em que a conta/gráfico/esquema for o ponto cobrado, acrescente "ilustracao".
- Presets: barras|linha|pizza|eixos|conta|tabela|fluxo|esquema (params coerentes com o enunciado).
- Contas: use preset "conta" com passos como no quadro. Não force ilustração em todo item.`)
  }

  if (needsInternetImages(disciplina, topicoNome)) {
    parts.push(`IMAGENS OPCIONAIS (História/Geografia — NÃO mude o formato JSON principal):
- Em itens que ganharem com mapa, monumento, pintura, paisagem ou figura histórica, acrescente
  "ilustracao": { "preset": "imagem", "imageUrl": "https://...", "caption": "legenda curta", "lado": "enunciado"|"pergunta" }
- Use só URL https pública real (ex.: Wikimedia Commons). Sem inventar link. Sem exagero (~15–30%).`)
  }

  if (needsPortugueseSourceText(disciplina, topicoNome) && (kind === 'questoes' || kind === 'flashcards')) {
    parts.push(`TEXTO-BASE OPCIONAL (Português / interpretação — NÃO mude o formato JSON principal):
- Se a questão/card for de compreensão ou interpretação e precisar do texto, inclua "textoBase" com o trecho completo.
- Se o item não depender de texto, omita "textoBase". Não invente obra com citação falsa.`)
  }

  if (!parts.length) return base

  return `${base}

═══ APÊNDICE DE MÍDIA (complementar — prompts e regras acima prevalecem) ═══
${parts.join('\n\n')}
Campos extras permitidos no mesmo objeto JSON já pedido: "ilustracao" e/ou "textoBase" (ou null/omitidos).`
}

/** @deprecated prefer appendVisualMediaAppendix */
export function buildStemIllustrationPromptBlock(disciplina = '', topicoNome = '', kind = 'questoes') {
  if (!needsVisualMediaSupport(disciplina, topicoNome)) return ''
  return appendVisualMediaAppendix('', disciplina, topicoNome, kind).trim()
}
