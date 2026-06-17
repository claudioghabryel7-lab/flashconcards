// Serviço de integração com API Datajud (CNJ/STJ) para jurisprudência
// Para garantir veracidade e atualização do conteúdo jurídico

const BASE_URL_DATAJUD = 'https://api-publica.datajud.cnj.jus.br'

/**
 * Busca processo por número único
 * @param {string} numeroProcesso - Número único do processo (CNJ)
 * @returns {Promise<Object>} Dados do processo
 */
export async function buscarProcessoPorNumero(numeroProcesso) {
  try {
    // A API Datajud requer autenticação via API Key
    // Para produção, é necessário obter a API Key oficial
    const response = await fetch(`${BASE_URL_DATAJUD}/processo/${numeroProcesso}`, {
      headers: {
        'Authorization': 'Bearer cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==',
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar processo: ${response.status}`)
    }
    
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Erro ao buscar processo por número:', error)
    throw error
  }
}

/**
 * Busca jurisprudência por termo (usando busca textual)
 * @param {string} termo - Termo de pesquisa
 * @param {Object} opcoes - Opções de busca (tribunal, data inicial, etc.)
 * @returns {Promise<Object>} Resultados da busca
 */
export async function buscarJurisprudenciaPorTermo(termo, opcoes = {}) {
  try {
    const params = new URLSearchParams({
      q: termo,
      ...opcoes
    })
    
    const response = await fetch(`${BASE_URL_DATAJUD}/processos/search?${params}`, {
      headers: {
        'Authorization': 'Bearer cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==',
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar jurisprudência: ${response.status}`)
    }
    
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Erro ao buscar jurisprudência por termo:', error)
    throw error
  }
}

/**
 * Formata dados da jurisprudência para uso no prompt da IA
 * @param {Object} processo - Dados do processo/jurisprudência
 * @returns {string} Texto formatado para o prompt
 */
export function formatarJurisprudenciaParaPrompt(processo) {
  if (!processo) return ''
  
  const partes = []
  
  if (processo.numero) {
    partes.push(`Processo: ${processo.numero}`)
  }
  
  if (processo.tribunal) {
    partes.push(`Tribunal: ${processo.tribunal}`)
  }
  
  if (processo.ementa) {
    partes.push(`Ementa: ${processo.ementa}`)
  }
  
  if (processo.relator) {
    partes.push(`Relator: ${processo.relator}`)
  }
  
  if (processo.dataJulgamento) {
    partes.push(`Data do Julgamento: ${processo.dataJulgamento}`)
  }
  
  if (processo.decisao) {
    partes.push(`Decisão: ${processo.decisao}`)
  }
  
  return partes.join('\n')
}

/**
 * Busca jurisprudência do STF específica
 * @param {string} termo - Termo de pesquisa
 * @returns {Promise<Object>} Resultados da busca
 */
export async function buscarJurisprudenciaSTF(termo) {
  try {
    return await buscarJurisprudenciaPorTermo(termo, {
      tribunal: 'STF'
    })
  } catch (error) {
    console.error('Erro ao buscar jurisprudência do STF:', error)
    throw error
  }
}

/**
 * Busca jurisprudência do STJ específica
 * @param {string} termo - Termo de pesquisa
 * @returns {Promise<Object>} Resultados da busca
 */
export async function buscarJurisprudenciaSTJ(termo) {
  try {
    return await buscarJurisprudenciaPorTermo(termo, {
      tribunal: 'STJ'
    })
  } catch (error) {
    console.error('Erro ao buscar jurisprudência do STJ:', error)
    throw error
  }
}

/**
 * Verifica se uma jurisprudência é recente (últimos 2 anos)
 * @param {string} dataJulgamento - Data do julgamento
 * @returns {boolean} True se for recente
 */
export function isJurisprudenciaRecente(dataJulgamento) {
  if (!dataJulgamento) return false
  
  const data = new Date(dataJulgamento)
  const doisAnosAtras = new Date()
  doisAnosAtras.setFullYear(doisAnosAtras.getFullYear() - 2)
  
  return data >= doisAnosAtras
}
