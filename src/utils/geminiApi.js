/**
 * Função utilitária para chamadas à API Gemini com retry e fallback
 * Resolve erros de alta demanda implementando exponential backoff e modelos alternativos
 */

const MODELS = [
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
]

const MAX_RETRIES = 3
const BASE_DELAY = 2000 // 2 segundos

/**
 * Faz uma chamada à API Gemini com retry automático e fallback de modelo
 * @param {string} prompt - O prompt para enviar à IA
 * @param {Object} options - Opções adicionais
 * @param {number} options.maxRetries - Número máximo de tentativas (padrão: 3)
 * @param {number} options.baseDelay - Delay base em ms (padrão: 2000)
 * @param {Array<string>} options.models - Lista de modelos para tentar (padrão: gemini-2.5-flash, gemini-1.5-flash, gemini-1.5-pro)
 * @param {Object} options.generationConfig - Configuração de geração (temperature, maxOutputTokens, etc.)
 * @returns {Promise<Object>} - Resposta da API
 */
export async function callGeminiWithRetry(prompt, options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    baseDelay = BASE_DELAY,
    models = MODELS,
    generationConfig = { temperature: 0.7, maxOutputTokens: 32000 },
  } = options

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY não configurada')
  }

  let lastError = null

  // Tentar cada modelo na lista
  for (const model of models) {
    console.log(`🔄 Tentando modelo: ${model}`)

    // Tentar com retry para o mesmo modelo
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig,
            }),
          }
        )

        const data = await response.json()

        if (!response.ok) {
          const errorMessage = data.error?.message || 'Erro na API da IA'
          
          // Se for erro de alta demanda, fazer retry com delay
          if (errorMessage.includes('high demand') || errorMessage.includes('temporarily')) {
            console.warn(`⚠️ Tentativa ${attempt}/${maxRetries} para ${model}: ${errorMessage}`)
            
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
        console.log(`✅ Sucesso com modelo ${model} na tentativa ${attempt}`)
        return data

      } catch (error) {
        lastError = error
        console.error(`❌ Erro na tentativa ${attempt} com modelo ${model}:`, error.message)
        
        // Se não for erro de alta demanda, não fazer retry no mesmo modelo
        if (!error.message.includes('high demand') && !error.message.includes('temporarily')) {
          break
        }
      }
    }
  }

  // Se chegou aqui, todos os modelos falharam
  throw new Error(
    `Todos os modelos falharam após múltiplas tentativas. Último erro: ${lastError?.message || 'Erro desconhecido'}`
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
