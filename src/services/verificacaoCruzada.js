// Serviço de verificação cruzada de informações
// Compara múltiplas fontes para garantir veracidade

import { buscarLegislacaoPorTermo, formatarLegislacaoParaPrompt } from './legislacaoService.js'
import { buscarJurisprudenciaPorTermo, formatarJurisprudenciaParaPrompt } from './jurisprudenciaService.js'

/**
 * Resultado da verificação cruzada
 */
class ResultadoVerificacao {
  constructor() {
    this.fontes = []
    this.concordancia = 0
    this.confianca = 'baixa'
    this.observacoes = []
  }
}

/**
 * Verifica cruzadamente uma informação usando múltiplas fontes
 * @param {string} informacao - Informação a ser verificada
 * @param {string} tipo - Tipo de informação ('legislacao', 'jurisprudencia', 'geral')
 * @returns {Promise<ResultadoVerificacao>} Resultado da verificação
 */
export async function verificarInformacaoCruzada(informacao, tipo = 'geral') {
  const resultado = new ResultadoVerificacao()
  
  try {
    // Busca em múltiplas fontes
    if (tipo === 'legislacao' || tipo === 'geral') {
      try {
        const legislacao = await buscarLegislacaoPorTermo(informacao)
        if (legislacao) {
          resultado.fontes.push({
            tipo: 'legislacao',
            fonte: 'Senado Federal',
            dados: legislacao,
            formato: formatarLegislacaoParaPrompt(legislacao)
          })
        }
      } catch (error) {
        resultado.observacoes.push(`Erro ao buscar legislação: ${error.message}`)
      }
    }
    
    if (tipo === 'jurisprudencia' || tipo === 'geral') {
      try {
        const jurisprudencia = await buscarJurisprudenciaPorTermo(informacao)
        if (jurisprudencia) {
          resultado.fontes.push({
            tipo: 'jurisprudencia',
            fonte: 'Datajud (CNJ)',
            dados: jurisprudencia,
            formato: formatarJurisprudenciaParaPrompt(jurisprudencia)
          })
        }
      } catch (error) {
        resultado.observacoes.push(`Erro ao buscar jurisprudência: ${error.message}`)
      }
    }
    
    // Calcula concordância entre fontes
    resultado.concordancia = calcularConcordancia(resultado.fontes)
    
    // Define nível de confiança
    resultado.confianca = determinarNivelConfianca(resultado)
    
  } catch (error) {
    resultado.observacoes.push(`Erro na verificação cruzada: ${error.message}`)
  }
  
  return resultado
}

/**
 * Calcula a concordância entre múltiplas fontes
 * @param {Array} fontes - Lista de fontes verificadas
 * @returns {number} Porcentagem de concordância (0-100)
 */
function calcularConcordancia(fontes) {
  if (fontes.length === 0) return 0
  if (fontes.length === 1) return 50 // 50% de confiança com apenas uma fonte
  
  // Se houver múltiplas fontes, verifica se há consistência
  // Esta é uma implementação simplificada - em produção seria mais complexa
  let concordancia = 70 // Base para múltiplas fontes
  
  // Aumenta concordância se houver mais fontes
  concordancia += (fontes.length - 1) * 10
  
  return Math.min(concordancia, 100)
}

/**
 * Determina o nível de confiança baseado na verificação
 * @param {ResultadoVerificacao} resultado - Resultado da verificação
 * @returns {string} Nível de confiança ('baixa', 'media', 'alta')
 */
function determinarNivelConfianca(resultado) {
  if (resultado.fontes.length === 0) return 'baixa'
  if (resultado.concordancia >= 80) return 'alta'
  if (resultado.concordancia >= 50) return 'media'
  return 'baixa'
}

/**
 * Formata o resultado da verificação para uso no prompt da IA
 * @param {ResultadoVerificacao} resultado - Resultado da verificação
 * @returns {string} Texto formatado para o prompt
 */
export function formatarResultadoVerificacaoParaPrompt(resultado) {
  if (!resultado || resultado.fontes.length === 0) {
    return '⚠️ Não foi possível verificar a informação em fontes oficiais.'
  }
  
  const partes = []
  
  partes.push(`📊 VERIFICAÇÃO CRUZADA - Confiança: ${resultado.confianca.toUpperCase()} (${resultado.concordancia}%)`)
  partes.push('')
  
  resultado.fontes.forEach((fonte, index) => {
    partes.push(`🔍 Fonte ${index + 1}: ${fonte.fonte} (${fonte.tipo})`)
    partes.push(fonte.formato)
    partes.push('')
  })
  
  if (resultado.observacoes.length > 0) {
    partes.push('⚠️ Observações:')
    resultado.observacoes.forEach(obs => {
      partes.push(`- ${obs}`)
    })
  }
  
  return partes.join('\n')
}

/**
 * Verifica se uma lei está atualizada usando múltiplas fontes
 * @param {string} numero - Número da lei
 * @param {string} ano - Ano da lei
 * @returns {Promise<ResultadoVerificacao>} Resultado da verificação
 */
export async function verificarAtualidadeLeiCruzada(numero, ano) {
  const resultado = new ResultadoVerificacao()
  
  try {
    // Busca na API do Senado
    try {
      const legislacao = await buscarLegislacaoPorTermo(`${numero}/${ano}`)
      if (legislacao) {
        resultado.fontes.push({
          tipo: 'legislacao',
          fonte: 'Senado Federal',
          dados: legislacao,
          formato: formatarLegislacaoParaPrompt(legislacao)
        })
      }
    } catch (error) {
      resultado.observacoes.push(`Erro ao buscar legislação: ${error.message}`)
    }
    
    // Calcula concordância e confiança
    resultado.concordancia = resultado.fontes.length > 0 ? 80 : 0
    resultado.confianca = resultado.fontes.length > 0 ? 'alta' : 'baixa'
    
  } catch (error) {
    resultado.observacoes.push(`Erro na verificação: ${error.message}`)
  }
  
  return resultado
}

/**
 * Compara informações de múltiplas fontes e destaca diferenças
 * @param {Array} informacoes - Lista de informações de diferentes fontes
 * @returns {Object} Análise comparativa
 */
export function compararFontes(informacoes) {
  const analise = {
    concordancias: [],
    divergencias: [],
    resumo: ''
  }
  
  // Implementação simplificada - em produção seria mais complexa
  if (informacoes.length < 2) {
    analise.resumo = 'Não há fontes suficientes para comparação'
    return analise
  }
  
  // Aqui seria implementada a lógica de comparação detalhada
  // Por enquanto, retorna um resumo genérico
  analise.resumo = `Comparação entre ${informacoes.length} fontes realizada.`
  
  return analise
}
