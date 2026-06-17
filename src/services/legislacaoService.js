// Serviço de integração com APIs oficiais de legislação
// Para garantir veracidade e atualização do conteúdo jurídico

const BASE_URL_SENADO = 'https://legis.senado.leg.br/dadosabertos'

/**
 * Busca legislação federal pelo código
 * @param {string} codigo - Código da norma jurídica
 * @returns {Promise<Object>} Dados da legislação
 */
export async function buscarLegislacaoPorCodigo(codigo) {
  try {
    const response = await fetch(`${BASE_URL_SENADO}/legislacao/${codigo}`)
    if (!response.ok) {
      throw new Error(`Erro ao buscar legislação: ${response.status}`)
    }
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Erro ao buscar legislação por código:', error)
    throw error
  }
}

/**
 * Busca legislação por tipo, número e ano
 * @param {string} tipo - Tipo da norma (ex: 'lei', 'decreto')
 * @param {string} numero - Número da norma
 * @param {string} ano - Ano da norma
 * @returns {Promise<Object>} Dados da legislação
 */
export async function buscarLegislacaoPorTipoNumeroAno(tipo, numero, ano) {
  try {
    const response = await fetch(`${BASE_URL_SENADO}/legislacao/${tipo}/${numero}/${ano}`)
    if (!response.ok) {
      throw new Error(`Erro ao buscar legislação: ${response.status}`)
    }
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Erro ao buscar legislação por tipo/número/ano:', error)
    throw error
  }
}

/**
 * Lista tipos de normas jurídicas disponíveis
 * @returns {Promise<Array>} Lista de tipos de normas
 */
export async function listarTiposNormas() {
  try {
    const response = await fetch(`${BASE_URL_SENADO}/legislacao/tiposNorma`)
    if (!response.ok) {
      throw new Error(`Erro ao listar tipos de normas: ${response.status}`)
    }
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Erro ao listar tipos de normas:', error)
    throw error
  }
}

/**
 * Busca legislação por termo (pesquisa textual)
 * @param {string} termo - Termo de pesquisa
 * @returns {Promise<Array>} Lista de legislações que correspondem ao termo
 */
export async function buscarLegislacaoPorTermo(termo) {
  try {
    const response = await fetch(`${BASE_URL_SENADO}/legislacao/termos/${encodeURIComponent(termo)}`)
    if (!response.ok) {
      throw new Error(`Erro ao buscar legislação por termo: ${response.status}`)
    }
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Erro ao buscar legislação por termo:', error)
    throw error
  }
}

/**
 * Formata dados da legislação para uso no prompt da IA
 * @param {Object} legislacao - Dados da legislação
 * @returns {string} Texto formatado para o prompt
 */
export function formatarLegislacaoParaPrompt(legislacao) {
  if (!legislacao) return ''
  
  const partes = []
  
  if (legislacao.sigla || legislacao.tipoNorma) {
    partes.push(`${legislacao.sigla || legislacao.tipoNorma} ${legislacao.numero || ''}/${legislacao.ano || ''}`)
  }
  
  if (legislacao.ementa) {
    partes.push(`Ementa: ${legislacao.ementa}`)
  }
  
  if (legislacao.dataPublicacao) {
    partes.push(`Data de Publicação: ${legislacao.dataPublicacao}`)
  }
  
  if (legislacao.situacao) {
    partes.push(`Situação: ${legislacao.situacao}`)
  }
  
  return partes.join('\n')
}

/**
 * Busca múltiplas fontes para verificação cruzada
 * @param {string} termo - Termo de pesquisa
 * @returns {Promise<Object>} Resultados de múltiplas fontes
 */
export async function buscaMultiplasFontes(termo) {
  const resultados = {
    senado: null,
    erro: null
  }
  
  try {
    resultados.senado = await buscarLegislacaoPorTermo(termo)
  } catch (error) {
    resultados.erro = error.message
  }
  
  return resultados
}
