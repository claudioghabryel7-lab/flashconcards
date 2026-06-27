/**
 * Função utilitária para chamadas à API Gemini com retry, fallback e rotação de API keys
 * Resolve erros de alta demanda implementando exponential backoff, modelos alternativos e rotação de múltiplas keys
 * Integra verificação de fontes oficiais para garantir veracidade do conteúdo
 * Implementa RAG (Retrieval-Augmented Generation) com Google Search para evitar alucinações
 */

import { performRAG, googleSearch } from './googleSearch.js'

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
]

const MAX_RETRIES = 3
const BASE_DELAY = 2000 // 2 segundos

/**
 * Extrai um tópico de busca do prompt para RAG
 * @param {string} prompt - O prompt original
 * @returns {string} - Tópico de busca extraído
 */
function extractSearchTopic(prompt) {
  // Extrair palavras-chave relevantes do prompt
  // Buscar por termos como "lei", "artigo", "código", "crime", etc.
  const legalKeywords = [
    'lei', 'artigo', 'código', 'crime', 'pena', 'regime', 'hediondo',
    'constitucional', 'stf', 'stj', 'jurisprudência', 'súmula',
    'processual', 'civil', 'penal', 'trabalhista', 'tributário'
  ]
  
  const lines = prompt.split('\n')
  let topic = ''
  
  // Buscar nas primeiras linhas do prompt (geralmente contém o tópico principal)
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i].toLowerCase()
    
    // Se encontrar palavras-chave legais, usar essa linha
    if (legalKeywords.some(keyword => line.includes(keyword))) {
      topic = lines[i]
      break
    }
  }
  
  // Se não encontrou, usar as primeiras 3 palavras do prompt
  if (!topic) {
    const words = prompt.split(' ').slice(0, 5).join(' ')
    topic = words
  }
  
  // Limpar e limitar o tópico
  topic = topic
    .replace(/[^\w\sáéíóúâêîôûãõàèìòùç]/gi, '')
    .trim()
    .substring(0, 200)
  
  return topic || 'legislação brasileira atualizada'
}

/**
 * Carrega múltiplas API keys do Gemini
 * Prioriza VITE_GEMINI_API_KEY, depois tenta numbered keys
 * @returns {Array<string>} - Lista de API keys disponíveis
 */
function loadApiKeys() {
  const apiKeys = []
  
  // Primeiro tenta a key principal
  const mainKey = import.meta.env.VITE_GEMINI_API_KEY
  if (mainKey) {
    apiKeys.push(mainKey)
  }
  
  // Depois tenta numbered keys (apenas se a principal não existir ou para backup)
  for (let i = 1; i <= 10; i++) {
    const key = import.meta.env[`VITE_GEMINI_API_KEY_${i}`]
    if (key && !apiKeys.includes(key)) {
      apiKeys.push(key)
    }
  }
  
  return apiKeys
}

/**
 * Faz uma chamada à API Gemini com retry automático, fallback de modelo e rotação de API keys
 * @param {string} prompt - O prompt para enviar à IA
 * @param {Object} options - Opções adicionais
 * @param {number} options.maxRetries - Número máximo de tentativas (padrão: 3)
 * @param {number} options.baseDelay - Delay base em ms (padrão: 2000)
 * @param {Array<string>} options.models - Lista de modelos para tentar (padrão: gemini-2.5-flash, gemini-2.5-flash-8b, gemini-2.5-pro)
 * @param {Object} options.generationConfig - Configuração de geração (temperature, maxOutputTokens, etc.)
 * @param {boolean} options.useGoogleSearch - Se deve usar Google Search Grounding (padrão: false)
 * @param {boolean} options.useRAG - Se deve usar RAG com Google Search API (padrão: true)
 * @param {string} options.ragTopic - Tópico específico para busca RAG (opcional)
 * @param {boolean} options.isLegalContent - Se o conteúdo é jurídico (usa busca em sites oficiais)
 * @param {boolean} options.useFunctionCalling - Se deve usar Function Calling para buscar em APIs oficiais (padrão: false)
 * @param {Array} options.tools - Ferramentas customizadas para Function Calling (padrão: [])
 * @returns {Promise<Object>} - Resposta da API
 */
export async function callGeminiWithRetry(prompt, options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    baseDelay = BASE_DELAY,
    models = MODELS,
    generationConfig = { temperature: 0.7, maxOutputTokens: 32000 },
    useGoogleSearch = true, // Ativado por padrão - usa Google Search nativo do Gemini
    useRAG = false, // Desativado por padrão - usa Google Search nativo em vez disso
    ragTopic = null,
    isLegalContent = true,
    useFunctionCalling = false,
    tools = [],
  } = options

  // RAG: Buscar contexto atualizado antes de enviar para IA
  let enhancedPrompt = prompt
  if (useRAG) {
    try {
      const searchTopic = ragTopic || extractSearchTopic(prompt)
      console.log(`🔍 RAG: Buscando contexto atualizado para: "${searchTopic.substring(0, 100)}..."`)
      
      const ragContext = await performRAG(searchTopic, isLegalContent)
      
      if (ragContext) {
        enhancedPrompt = ragContext + '\n\n' + prompt
        console.log('✅ RAG: Contexto de busca adicionado ao prompt')
      }
    } catch (error) {
      console.warn('⚠️ RAG: Erro ao buscar contexto, continuando sem RAG:', error.message)
    }
  }

  const apiKeys = loadApiKeys()
  if (apiKeys.length === 0) {
    throw new Error('Nenhuma API key do Gemini encontrada')
  }

  console.log(`🔑 API Keys carregadas: ${apiKeys.length}`)
  if (useGoogleSearch) {
    console.log(`🔍 Google Search Grounding ativado`)
  }
  if (useRAG) {
    console.log(`🔍 RAG ativado (conteúdo jurídico: ${isLegalContent})`)
  }
  if (useFunctionCalling) {
    console.log(`🔧 Function Calling ativado com ${tools.length} ferramentas`)
  }

  // Usar o prompt com contexto RAG
  const finalPrompt = enhancedPrompt

  let lastError = null

  // Tentar cada modelo na lista
  for (const model of models) {
    console.log(`🔄 Tentando modelo: ${model}`)

    // Tentar cada API key
    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
      const apiKey = apiKeys[keyIndex]
      console.log(`🔑 Tentando API key ${keyIndex + 1}/${apiKeys.length}`)

      // Tentar com retry para o mesmo modelo e key
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const requestBody = {
            contents: [{ parts: [{ text: finalPrompt }] }],
            generationConfig,
          }

          // Adicionar Google Search Grounding se solicitado
          if (useGoogleSearch) {
            requestBody.tools = [
              {
                googleSearch: {}
              }
            ]
          }

          // Adicionar Function Calling se solicitado
          if (useFunctionCalling && tools.length > 0) {
            requestBody.tools = requestBody.tools || []
            requestBody.tools.push(...tools)
          }

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            }
          )

          const data = await response.json()

          if (!response.ok) {
            const errorMessage = data.error?.message || 'Erro na API da IA'
            
            // Se for erro 429 (quota), tentar próxima key
            if (response.status === 429) {
              console.log(`⚠️ API key ${keyIndex + 1} atingiu quota, tentando próxima...`)
              break
            }
            
            // Se for erro 503 (alta demanda), fazer retry com delay
            if (response.status === 503 || errorMessage.includes('high demand') || errorMessage.includes('temporarily')) {
              console.warn(`⚠️ Tentativa ${attempt}/${maxRetries} para ${model} com key ${keyIndex + 1}: ${errorMessage}`)
              
              if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1) // Exponential backoff
                console.log(`⏳ Aguardando ${delay}ms antes de tentar novamente...`)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
              } else {
                throw new Error(`Modelo ${model} com alta demanda após ${maxRetries} tentativas`)
              }
            }
            
            throw new Error(errorMessage)
          }

          // Sucesso!
          console.log(`✅ Sucesso com modelo ${model} e API key ${keyIndex + 1} na tentativa ${attempt}`)
          return data

        } catch (error) {
          lastError = error
          console.error(`❌ Erro na tentativa ${attempt} com modelo ${model} e key ${keyIndex + 1}:`, error.message)
          
          // Se não for erro de alta demanda, não fazer retry no mesmo modelo
          if (!error.message.includes('high demand') && !error.message.includes('temporarily')) {
            break
          }
        }
      }
    }
  }

  // Se chegou aqui, todos os modelos e keys falharam
  throw new Error(
    `Todos os modelos e API keys falharam após múltiplas tentativas. Último erro: ${lastError?.message || 'Erro desconhecido'}`
  )
}

/**
 * Extrai o texto gerado da resposta da API
 * @param {Object} response - Resposta da API Gemini
 * @returns {string} - Texto gerado
 */
export function extractGeneratedText(response) {
  const generatedText = response.candidates?.[0]?.content?.parts?.[0]?.text || ''
  
  if (!generatedText) {
    throw new Error('A IA não retornou nenhum texto')
  }

  if (typeof generatedText !== 'string') {
    throw new Error('A IA retornou um texto inválido')
  }

  return generatedText
}

/**
 * Extrai e parseia JSON da resposta da API
 * @param {Object} response - Resposta da API Gemini
 * @returns {Object} - Objeto JSON parseado
 */
export async function extractJsonFromResponse(response) {
  const generatedText = extractGeneratedText(response)
  
  // Procurar por JSON
  const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Nenhum JSON válido encontrado na resposta')
  }

  let parsed
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    // Tentar usar jsonrepair se o JSON estiver corrompido
    const { default: jsonrepair } = await import('jsonrepair')
    parsed = JSON.parse(jsonrepair(jsonMatch[0]))
  }

  return parsed
}

/**
 * Testa o status de uma API key do Gemini
 * @param {string} apiKey - A API key para testar
 * @returns {Promise<Object>} - Status da key
 */
async function testApiKey(apiKey) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'test' }] }],
          generationConfig: { maxOutputTokens: 10 }
        })
      }
    )

    const data = await response.json()

    if (response.ok) {
      return {
        status: 'active',
        message: 'Ativa e funcionando',
        remainingQuota: 'Desconhecido'
      }
    }

    // Interpretar erros
    if (response.status === 429) {
      const errorInfo = data.error?.details?.[0]
      const waitTime = errorInfo?.metadata?.retryDelay || errorInfo?.metadata?.waitTime
      
      if (waitTime) {
        const seconds = parseInt(waitTime)
        return {
          status: 'rate_limited',
          message: 'Bloqueada por excesso de requisições',
          waitTime: seconds,
          waitTimeFormatted: formatWaitTime(seconds)
        }
      }
      
      return {
        status: 'quota_exceeded',
        message: 'Cota diária esgotada',
        resetTime: 'Zera na madrugada (UTC)'
      }
    }

    if (response.status === 403) {
      return {
        status: 'forbidden',
        message: 'Projeto bloqueado ou sem permissão',
        error: data.error?.message || 'Acesso negado'
      }
    }

    if (response.status === 400) {
      return {
        status: 'invalid',
        message: 'Chave inválida ou não encontrada',
        error: data.error?.message || 'API Key not found'
      }
    }

    return {
      status: 'error',
      message: `Erro ${response.status}`,
      error: data.error?.message || 'Erro desconhecido'
    }
  } catch (error) {
    return {
      status: 'error',
      message: 'Erro ao conectar',
      error: error.message
    }
  }
}

/**
 * Formata tempo de espera para exibição
 * @param {number} seconds - Tempo em segundos
 * @returns {string} - Tempo formatado
 */
function formatWaitTime(seconds) {
  if (seconds < 60) {
    return `${seconds} segundos`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? `${minutes} minutos e ${remainingSeconds} segundos`
      : `${minutes} minutos`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0
    ? `${hours} horas e ${remainingMinutes} minutos`
    : `${hours} horas`
}

/**
 * Verifica o status de todas as API keys do Gemini
 * @returns {Promise<Array<Object>>} - Lista de status das keys
 */
export async function checkGeminiApiKeysStatus() {
  const apiKeys = loadApiKeys()
  const results = []

  for (let i = 0; i < apiKeys.length; i++) {
    const key = apiKeys[i]
    const keyName = i === 0 ? 'VITE_GEMINI_API_KEY (Principal)' : `VITE_GEMINI_API_KEY_${i}`
    
    console.log(`🔍 Testando ${keyName}...`)
    const status = await testApiKey(key)
    
    results.push({
      name: keyName,
      keyPreview: key.substring(0, 10) + '...',
      ...status
    })
  }

  return results
}
