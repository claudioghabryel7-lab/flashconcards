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

export function coerceHtmlContent(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw
  return raw
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
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

  return {
    enunciado: String(questao.enunciado || questao.pergunta || `Questão ${index + 1}`),
    alternativas: normalizedAlts,
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
