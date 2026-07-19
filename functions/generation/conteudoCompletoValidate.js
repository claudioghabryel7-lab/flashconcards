const MIN_TOPICOS_QUENTES = 6
const MIN_QUESTOES = 8
const MIN_PALAVRAS_POR_RESUMO = 220

function stripHtml(text = '') {
  return String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function wordCount(text = '') {
  const plain = stripHtml(text)
  if (!plain) return 0
  return plain.split(/\s+/).filter(Boolean).length
}

function validateConteudoCompletoPayload(parsed = {}) {
  const errors = []

  const topicosQuentes = parsed?.raioXProbabilidade?.topicosQuentes
  if (!Array.isArray(topicosQuentes) || topicosQuentes.length < MIN_TOPICOS_QUENTES) {
    errors.push(`Raio-X incompleto: esperado pelo menos ${MIN_TOPICOS_QUENTES} assuntos quentes.`)
  }

  const revisaoTurbo = parsed?.revisaoTurbo
  if (!Array.isArray(revisaoTurbo) || !revisaoTurbo.length) {
    errors.push('Revisão Turbo ausente ou vazia.')
  } else if (Array.isArray(topicosQuentes) && revisaoTurbo.length < topicosQuentes.length) {
    errors.push(
      `Revisão Turbo incompleta: ${revisaoTurbo.length}/${topicosQuentes.length} resumos (falta um por assunto quente).`,
    )
  }

  if (Array.isArray(revisaoTurbo)) {
    // Aceita ~60% do mínimo alvo (evita rejeitar material bom por margem estreita)
    const floor = Math.floor(MIN_PALAVRAS_POR_RESUMO * 0.6)
    revisaoTurbo.forEach((item, idx) => {
      const words = wordCount(item?.conteudo || item?.resumo || '')
      if (words < floor) {
        errors.push(`Resumo ${idx + 1} muito curto (${words} palavras).`)
      }
    })
  }

  const pegadinhas = parsed?.pegadinhas
  if (!Array.isArray(pegadinhas) || pegadinhas.length < 3) {
    errors.push('Seção "Cuidado, Caçapa!" (pegadinhas) ausente ou incompleta.')
  }

  const questoes = parsed?.questoesPreditivas
  if (!Array.isArray(questoes) || questoes.length < MIN_QUESTOES) {
    errors.push(
      `Questões preditivas incompletas: esperado ${MIN_QUESTOES}, recebido ${questoes?.length || 0}.`,
    )
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}

function validateMaterialCorePayload(parsed = {}) {
  const errors = []
  const topicosQuentes = parsed?.raioXProbabilidade?.topicosQuentes
  if (!Array.isArray(topicosQuentes) || topicosQuentes.length < MIN_TOPICOS_QUENTES) {
    errors.push(`Raio-X incompleto: esperado pelo menos ${MIN_TOPICOS_QUENTES} assuntos quentes.`)
  }
  const revisaoTurbo = parsed?.revisaoTurbo
  if (!Array.isArray(revisaoTurbo) || !revisaoTurbo.length) {
    errors.push('Revisão Turbo ausente ou vazia.')
  }
  return { ok: errors.length === 0, errors }
}

function validateMaterialExtrasPayload(parsed = {}) {
  const errors = []
  const pegadinhas = parsed?.pegadinhas
  if (!Array.isArray(pegadinhas) || pegadinhas.length < 3) {
    errors.push('Seção pegadinhas ausente ou incompleta.')
  }
  const questoes = parsed?.questoesPreditivas
  if (!Array.isArray(questoes) || questoes.length < MIN_QUESTOES) {
    errors.push(`Questões preditivas embutidas insuficientes (mín. ${MIN_QUESTOES}).`)
  }
  return { ok: errors.length === 0, errors }
}

module.exports = {
  validateConteudoCompletoPayload,
  validateMaterialCorePayload,
  validateMaterialExtrasPayload,
  wordCount,
}
