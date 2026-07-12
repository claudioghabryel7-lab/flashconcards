function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripHtml(text = '') {
  return String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function coerceHtml(text = '') {
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
    return { titulo: fallbackTitle, conteudo: coerceHtml(item) }
  }
  return {
    titulo: item.titulo || item.assunto || item.nome || fallbackTitle,
    conteudo: coerceHtml(item.conteudo || item.resumo || item.texto || ''),
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

  if (!Object.keys(normalizedAlts).length && Array.isArray(questao.opcoes)) {
    questao.opcoes.forEach((opt, idx) => {
      if (letters[idx]) normalizedAlts[letters[idx]] = String(opt)
    })
  }

  return {
    enunciado: String(questao.enunciado || questao.pergunta || `Questão ${index + 1}`),
    alternativas: normalizedAlts,
    correta: questao.correta || questao.respostaCorreta || questao.gabarito || 'A',
    gabaritoComentado: coerceHtml(
      questao.gabaritoComentado || questao.explicacao || questao.comentario || '',
    ),
  }
}

function normalizeConteudoCompletoMaterial(parsed = {}, topicKey = '') {
  const materia = (parsed.materia || stripHtml(parsed.titulo) || topicKey || 'Tópico').trim()
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

function hydrateConteudoCompletoMaterial(parsed = {}, topicKey = '') {
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
  raioX.padraoBanca = coerceHtml(raioX.padraoBanca || '')

  if (!revisaoTurbo.length && raioX.topicosQuentes.length) {
    revisaoTurbo = raioX.topicosQuentes.map((titulo) => ({
      titulo,
      conteudo: coerceHtml(base.content || ''),
    }))
  }

  if (base.content) {
    base.content = coerceHtml(base.content)
  }

  if (Array.isArray(base.secoes)) {
    base.secoes = base.secoes.map((secao, idx) => ({
      ...secao,
      titulo: secao.titulo || `Seção ${idx + 1}`,
      conteudo: coerceHtml(secao.conteudo || ''),
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

module.exports = {
  coerceHtml,
  normalizeConteudoCompletoMaterial,
  hydrateConteudoCompletoMaterial,
}
