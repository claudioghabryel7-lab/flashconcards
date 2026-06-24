/**
 * Função utilitária para chamadas à API Gemini com retry, fallback e rotação de API keys
 * Resolve erros de alta demanda implementando exponential backoff, modelos alternativos e rotação de múltiplas keys
 * Integra verificação de fontes oficiais para garantir veracidade do conteúdo
 */

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-8b',
  'gemini-2.5-pro',
]

const MAX_RETRIES = 3
const BASE_DELAY = 2000 // 2 segundos

/**
 * Carrega múltiplas API keys do Gemini
 * @returns {Array<string>} - Lista de API keys disponíveis
 */
function loadApiKeys() {
  const apiKeys = []
  for (let i = 1; i <= 10; i++) {
    const key = import.meta.env[`VITE_GEMINI_API_KEY_${i}`] || import.meta.env[`VITE_GEMINI_API_KEY`]
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
    useGoogleSearch = false,
    useFunctionCalling = false,
    tools = [],
  } = options

  const apiKeys = loadApiKeys()
  if (apiKeys.length === 0) {
    throw new Error('Nenhuma API key do Gemini encontrada')
  }

  console.log(`🔑 API Keys carregadas: ${apiKeys.length}`)
  if (useGoogleSearch) {
    console.log(`🔍 Google Search Grounding ativado`)
  }
  if (useFunctionCalling) {
    console.log(`🔧 Function Calling ativado com ${tools.length} ferramentas`)
  }

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
            contents: [{ parts: [{ text: prompt }] }],
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
