import {
  hasMarkdownArtifacts,
  normalizeMarkdownToHtml,
  sanitizeQuestaoAlternativas,
  sanitizeQuestaoText,
} from './aiTextFormatting'

export function stripHtmlLite(text = '') {
  return String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Quebra texto corrido em parágrafos legíveis. */
export function splitIntoReadableParagraphs(text = '') {
  const trimmed = String(text || '').trim()
  if (!trimmed) return []

  if (/\n\s*\n/.test(trimmed)) {
    return trimmed.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean)
  }

  if (trimmed.includes('\n')) {
    return trimmed.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  }

  const sentences = trimmed.match(/[^.!?…]+[.!?…]+(?:\s+|$)|[^.!?…]+$/g) || [trimmed]
  const paragraphs = []
  let buffer = []
  let length = 0

  for (const sentence of sentences) {
    const part = sentence.trim()
    if (!part) continue
    buffer.push(part)
    length += part.length
    if (buffer.length >= 3 || length >= 420) {
      paragraphs.push(buffer.join(' '))
      buffer = []
      length = 0
    }
  }

  if (buffer.length) paragraphs.push(buffer.join(' '))
  return paragraphs.length ? paragraphs : [trimmed]
}

function htmlToPlainText(html = '') {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Converte texto (puro ou HTML apertado) em HTML com parágrafos espaçados. */
export function coerceHtmlContent(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return ''

  let working = raw
  if (hasMarkdownArtifacts(raw)) {
    working = normalizeMarkdownToHtml(raw)
  }

  if (/<[a-z][\s\S]*>/i.test(working)) {
    const plain = htmlToPlainText(working)
    const paragraphCount = (working.match(/<p[\s>]/gi) || []).length

    if (paragraphCount <= 1 && plain.length > 280) {
      return splitIntoReadableParagraphs(plain)
        .map((block) => `<p class="material-paragraph">${escapeHtml(block)}</p>`)
        .join('')
    }

    return working
      .replace(/<p>/gi, '<p class="material-paragraph">')
      .replace(/<p\s+class="/gi, '<p class="material-paragraph ')
  }

  return splitIntoReadableParagraphs(working)
    .map((block) => `<p class="material-paragraph">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

function normalizeListItem(item, fallbackTitle = 'Item') {
  if (!item) return null
  if (typeof item === 'string') {
    return { titulo: fallbackTitle, conteudo: coerceHtmlContent(item) }
  }
  return {
    titulo: item.titulo || item.assunto || item.nome || fallbackTitle,
    conteudo: coerceHtmlContent(item.conteudo || item.resumo || item.texto || ''),
  }
}

function normalizeQuestao(questao = {}, index = 0) {
  const alternativas = questao.alternativas || {}
  const letters = ['A', 'B', 'C', 'D', 'E']
  const normalizedAlts = {}

  letters.forEach((letter) => {
    if (alternativas[letter] != null) {
      normalizedAlts[letter] = String(alternativas[letter])
    }
  })

  const enunciadoRaw = sanitizeQuestaoText(
    String(questao.enunciado || questao.pergunta || `Questão ${index + 1}`),
  )
  const enunciadoParagraphs = splitIntoReadableParagraphs(htmlToPlainText(enunciadoRaw))

  return {
    enunciado: enunciadoParagraphs.join('\n\n'),
    alternativas: sanitizeQuestaoAlternativas(normalizedAlts),
    correta: questao.correta || questao.respostaCorreta || questao.gabarito || 'A',
    gabaritoComentado: coerceHtmlContent(
      questao.gabaritoComentado || questao.explicacao || questao.comentario || '',
    ),
  }
}

export function normalizeConteudoCompletoMaterial(parsed = {}, topicKey = '') {
  const materia = (parsed.materia || stripHtmlLite(parsed.titulo) || topicKey || 'Tópico').trim()
  let titulo = String(parsed.titulo || '').trim()

  if (!titulo || titulo === materia || /^material de apoio$/i.test(titulo)) {
    titulo = `Material de Apoio Completo: ${materia}`
  } else if (!/material de apoio/i.test(titulo)) {
    titulo = `Material de Apoio Completo: ${titulo}`
  }

  return {
    ...parsed,
    materia,
    titulo,
    numero: parsed.numero || topicKey,
  }
}

/** Normaliza campos que a IA salva torto — garante estrutura bonita na tela. */
export function hydrateConteudoCompletoMaterial(parsed = {}, topicKey = '') {
  const base = normalizeConteudoCompletoMaterial(parsed, topicKey)

  let revisaoTurbo = Array.isArray(base.revisaoTurbo)
    ? base.revisaoTurbo.map((item, idx) => normalizeListItem(item, `Assunto ${idx + 1}`)).filter(Boolean)
    : []

  let pegadinhas = Array.isArray(base.pegadinhas)
    ? base.pegadinhas.map((item, idx) => normalizeListItem(item, `Cuidado, Caçapa! ${idx + 1}`)).filter(Boolean)
    : []

  let questoesPreditivas = Array.isArray(base.questoesPreditivas)
    ? base.questoesPreditivas.map((q, idx) => normalizeQuestao(q, idx))
    : []

  let raioX = base.raioXProbabilidade || null
  if (!raioX || typeof raioX !== 'object') {
    raioX = { topicosQuentes: [], padraoBanca: '' }
  }

  if (!Array.isArray(raioX.topicosQuentes) || !raioX.topicosQuentes.length) {
    raioX.topicosQuentes = revisaoTurbo.map((item) => item.titulo).filter(Boolean)
  }

  raioX.topicosQuentes = raioX.topicosQuentes.map((t) => String(t).trim()).filter(Boolean)
  raioX.padraoBanca = coerceHtmlContent(raioX.padraoBanca || '')

  if (!revisaoTurbo.length && raioX.topicosQuentes.length) {
    revisaoTurbo = raioX.topicosQuentes.map((titulo) => ({
      titulo,
      conteudo: coerceHtmlContent(base.content || ''),
    }))
  }

  if (base.content) {
    base.content = coerceHtmlContent(base.content)
  }

  if (Array.isArray(base.secoes)) {
    base.secoes = base.secoes.map((secao, idx) => ({
      ...secao,
      titulo: secao.titulo || `Seção ${idx + 1}`,
      conteudo: coerceHtmlContent(secao.conteudo || ''),
    }))
  }

  return {
    ...base,
    raioXProbabilidade: raioX,
    revisaoTurbo,
    pegadinhas,
    questoesPreditivas,
  }
}

export function materialHasStructuredSections(material = {}) {
  return Boolean(
    material.raioXProbabilidade?.topicosQuentes?.length ||
    material.revisaoTurbo?.length ||
    material.pegadinhas?.length ||
    material.questoesPreditivas?.length ||
    material.secoes?.length,
  )
}

export function resolveMaterialPdfFilename(material = {}, fallback = 'material') {
  const base =
    material.titulo ||
    (material.materia ? `Material de Apoio Completo - ${material.materia}` : fallback)
  return `${base}.pdf`
}
