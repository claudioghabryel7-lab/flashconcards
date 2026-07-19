const { buildMaterialPrompt } = require('./unifiedGenerationPrompts')

const MIN_TOPICOS_QUENTES = 6
const MAX_TOPICOS_QUENTES = 10
const MIN_QUESTOES = 8
const MIN_PALAVRAS_POR_RESUMO = 220
const MAX_PALAVRAS_POR_RESUMO = 320

function buildConteudoCompletoServerPrompt(params = {}) {
  return buildMaterialPrompt(params)
}

module.exports = {
  buildConteudoCompletoServerPrompt,
  MIN_TOPICOS_QUENTES,
  MAX_TOPICOS_QUENTES,
  MIN_QUESTOES,
  MIN_PALAVRAS_POR_RESUMO,
  MAX_PALAVRAS_POR_RESUMO,
}
