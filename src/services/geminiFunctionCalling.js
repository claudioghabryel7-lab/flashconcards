// Serviço de Function Calling para Gemini API
// Permite que a IA chame funções customizadas para buscar dados em APIs oficiais

import { buscarLegislacaoPorTermo, formatarLegislacaoParaPrompt } from './legislacaoService.js'
import { buscarJurisprudenciaPorTermo, formatarJurisprudenciaParaPrompt } from './jurisprudenciaService.js'

/**
 * Definição das funções disponíveis para o Gemini Function Calling
 */
export const geminiFunctions = {
  buscarLegislacao: {
    description: 'Busca legislação federal brasileira por termo (leis, decretos, medidas provisórias, etc.)',
    parameters: {
      type: 'object',
      properties: {
        termo: {
          type: 'string',
          description: 'Termo de pesquisa para buscar legislação (ex: "lei seca", "Código Penal", "direito constitucional")'
        }
      },
      required: ['termo']
    }
  },
  buscarJurisprudencia: {
    description: 'Busca jurisprudência brasileira por termo (decisões de tribunais, STF, STJ, etc.)',
    parameters: {
      type: 'object',
      properties: {
        termo: {
          type: 'string',
          description: 'Termo de pesquisa para buscar jurisprudência (ex: "habeas corpus", "recurso especial", "direito civil")'
        },
        tribunal: {
          type: 'string',
          description: 'Tribunal específico (opcional: STF, STJ, TJSP, etc.)',
          enum: ['STF', 'STJ', 'TJSP', 'TJRJ', 'TJMG', 'TJRS', 'TJPR', 'TJBA', 'TJPE', 'TJCE', 'TJMA', 'TJSC', 'TJGO', 'TJDF', 'TJSE', 'TJAM', 'TJRR', 'TJAC', 'TJRO', 'TJTO', 'TJAP', 'TJMT']
        }
      },
      required: ['termo']
    }
  },
  verificarAtualidadeLei: {
    description: 'Verifica se uma lei está atualizada e vigente',
    parameters: {
      type: 'object',
      properties: {
        numero: {
          type: 'string',
          description: 'Número da lei (ex: "13.964")'
        },
        ano: {
          type: 'string',
          description: 'Ano da lei (ex: "2019")'
        }
      },
      required: ['numero', 'ano']
    }
  }
}

/**
 * Executa a função chamada pelo Gemini
 * @param {string} functionName - Nome da função
 * @param {Object} args - Argumentos da função
 * @returns {Promise<Object>} Resultado da função
 */
export async function executeGeminiFunction(functionName, args) {
  try {
    switch (functionName) {
      case 'buscarLegislacao':
        const legislacao = await buscarLegislacaoPorTermo(args.termo)
        return {
          sucesso: true,
          dados: legislacao,
          formato: formatarLegislacaoParaPrompt(legislacao)
        }
      
      case 'buscarJurisprudencia':
        const jurisprudencia = await buscarJurisprudenciaPorTermo(args.termo, {
          tribunal: args.tribunal
        })
        return {
          sucesso: true,
          dados: jurisprudencia,
          formato: formatarJurisprudenciaParaPrompt(jurisprudencia)
        }
      
      case 'verificarAtualidadeLei':
        const lei = await buscarLegislacaoPorTipoNumeroAno('lei', args.numero, args.ano)
        return {
          sucesso: true,
          dados: lei,
          atual: lei.situacao === 'VIGENTE' || lei.situacao === 'EM VIGOR',
          situacao: lei.situacao
        }
      
      default:
        throw new Error(`Função desconhecida: ${functionName}`)
    }
  } catch (error) {
    console.error(`Erro ao executar função ${functionName}:`, error)
    return {
      sucesso: false,
      erro: error.message
    }
  }
}

/**
 * Prepara as ferramentas para o Gemini API
 * @returns {Array} Array de ferramentas no formato do Gemini
 */
export function prepareGeminiTools() {
  return [
    {
      functionDeclarations: [
        {
          name: 'buscarLegislacao',
          description: geminiFunctions.buscarLegislacao.description,
          parameters: geminiFunctions.buscarLegislacao.parameters
        },
        {
          name: 'buscarJurisprudencia',
          description: geminiFunctions.buscarJurisprudencia.description,
          parameters: geminiFunctions.buscarJurisprudencia.parameters
        },
        {
          name: 'verificarAtualidadeLei',
          description: geminiFunctions.verificarAtualidadeLei.description,
          parameters: geminiFunctions.verificarAtualidadeLei.parameters
        }
      ]
    }
  ]
}

/**
 * Processa chamadas de função do Gemini e retorna os resultados
 * @param {Array} functionCalls - Chamadas de função do Gemini
 * @returns {Promise<Array>} Resultados das chamadas
 */
export async function processGeminiFunctionCalls(functionCalls) {
  const results = []
  
  for (const call of functionCalls) {
    const { name, args } = call
    const result = await executeGeminiFunction(name, args)
    results.push({
      functionResponse: {
        name: name,
        response: result
      }
    })
  }
  
  return results
}
