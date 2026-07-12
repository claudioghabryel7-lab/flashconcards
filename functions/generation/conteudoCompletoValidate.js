const MIN_TOPICOS_QUENTES = 8
const MIN_QUESTOES = 8
const MIN_PALAVRAS_POR_RESUMO = 600

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
    revisaoTurbo.forEach((item, idx) => {
      const words = wordCount(item?.conteudo || item?.resumo || '')
      if (words < Math.floor(MIN_PALAVRAS_POR_RESUMO * 0.5)) {
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

module.exports = {
  validateConteudoCompletoPayload,
  wordCount,
}
