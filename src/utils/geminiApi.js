/**
 * Função utilitária para chamadas à API Gemini com retry e fallback de modelos
 * Resolve erros de alta demanda implementando exponential backoff e modelos alternativos
 * Integra verificação de fontes oficiais para garantir veracidade do conteúdo
 * Implementa RAG (Retrieval-Augmented Generation) com Google Search para evitar alucinações
 * Usa uma única chave: VITE_GEMINI_API_KEY
 */

import { performRAG, googleSearch } from './googleSearch.js'
import { readEnv } from '../lib/env.js'
import { fetchCourseAiContext, buildPromptWithCourseContext } from './courseAiContext.js'
import {
  buildVerificationPrompt,
  parseVerificationResult,
  shouldRunVerification,
  applyVerificationToResponse,
} from './contentVerification.js'
import { appendSilentJsonRules } from './aiPromptUtils.js'
import {
  GEMINI_FLASH_MODEL,
  getDefaultGeminiModels,
  VERIFY_GEMINI_MODELS,
  withCostSafeThinking,
} from './geminiModels.js'
import { trackGeminiUsage } from '../services/aiUsageTracker.js'

const MODELS = getDefaultGeminiModels()
const VERIFY_MODELS = VERIFY_GEMINI_MODELS

/**
 * Defaults baratos. Chamadas longas (material/questões) já passam maxOutputTokens alto.
 * thinkingLevel minimal evita tokens de raciocínio cobrados como output no Gemini 3.x.
 */
const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.35,
  maxOutputTokens: 8192,
  // thinkingConfig injetado por modelo em executeGeminiRequest (withCostSafeThinking)
}

/** Conteúdo jurídico longo: thinking low (qualidade) sem o default medium/high. */
export const CONTENT_GENERATION_CONFIG = {
  temperature: 0.35,
  maxOutputTokens: 32000,
  thinkingConfig: { thinkingLevel: 'low' },
}

const VERIFY_GENERATION_CONFIG = {
  temperature: 0,
  maxOutputTokens: 2048,
  thinkingConfig: { thinkingLevel: 'minimal' },
}

const MAX_RETRIES = 1 // Apenas 1 tentativa para economizar quota
const BASE_DELAY = 2000 // 2 segundos

/** Cache do probe da API key — evita 1 chamada Gemini extra a cada generateContent. */
const API_KEY_PROBE_TTL_MS = 10 * 60 * 1000
let apiKeyProbeCache = { key: '', ok: false, checkedAt: 0 }

/** Erros aceitáveis para exibir ao usuário (cota / limite gratuito). */
export function isGeminiQuotaError(error) {
  const msg = String(error?.message || error || '').toLowerCase()
  const code = String(error?.code || '').toLowerCase()
  return (
    code.includes('429') ||
    code.includes('quota') ||
    code.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('exceeded') ||
    msg.includes('esgotad') ||
    msg.includes('limite') ||
    msg.includes('too many requests') ||
    msg.includes('resource has been exhausted')
  )
}

export function formatAiErrorForUser(error) {
  if (isGeminiQuotaError(error)) {
    return 'Cota da API Gemini esgotada ou limite gratuito atingido. Tente novamente mais tarde ou configure outra chave.'
  }

  const code = String(error?.code || '')
  const msg = String(error?.message || '').trim()

  // Erros de negócio / bot (já em português) — não mascarar
  if (
    code === 'missing_data_prova' ||
    code === 'prova_passada' ||
    code === 'cronograma_empty' ||
    code === 'cronograma_invalid' ||
    code === 'questoes_invalid' ||
    code === 'flashcards_invalid' ||
    /data da prova|edital|cronograma|tópico|questão|questao|firestore|permiss/i.test(msg)
  ) {
    return msg || 'Falha na operação. Tente novamente.'
  }

  if (msg && msg.length >= 12 && msg.length <= 280 && !/^error:/i.test(msg)) {
    // Mensagem útil do processador (PT) — preservar
    if (/[áàâãéêíóôõúç]/i.test(msg) || /\b(gere|informe|ajuste|salve|tente|falha|erro)\b/i.test(msg)) {
      return msg
    }
  }

  return msg && msg.length < 200 ? msg : 'Falha na geração com IA. Tente novamente.'
}

function stripConversationalWrapper(text = '') {
  const cleaned = String(text).trim()
  const start = cleaned.search(/[\[{]/)
  if (start > 0) return cleaned.slice(start)
  return cleaned
}

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
 * Carrega a única API key do Gemini (VITE_GEMINI_API_KEY)
 * @returns {string|undefined}
 */
function getApiKey() {
  const key = readEnv('VITE_GEMINI_API_KEY')
  return key || undefined
}

async function callGeminiViaServer(prompt, options = {}) {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...options }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Erro na API Gemini (${response.status})`)
  }

  const modelUsed =
    data?.modelUsed ||
    (Array.isArray(options.models) && options.models[0]) ||
    GEMINI_FLASH_MODEL
  void trackGeminiUsage({
    response: data,
    model: modelUsed,
    purpose: options.purpose || 'generate',
    courseId: options.courseId || null,
  })

  return data
}

/**
 * Teste silencioso de API key para verificar se está disponível
 * Usa a mesma lógica robusta de testApiKey
 * @param {string} apiKey - A API key para testar
 * @returns {Promise<boolean>} - True se a key está disponível
 */
async function silentTestApiKey(apiKey) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ok' }] }],
          generationConfig: {
            maxOutputTokens: 1,
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
      }
    )

    // 429/503/403/400 → indisponível; demais ok (inclui 200)
    if (
      response.status === 429 ||
      response.status === 503 ||
      response.status === 403 ||
      response.status === 400
    ) {
      return false
    }

    return response.ok
  } catch {
    return false
  }
}

/**
 * Retorna a API key. Probe da key só a cada API_KEY_PROBE_TTL_MS
 * (antes: 1 generateContent "test" em TODA chamada — vazamento grave).
 * @returns {Promise<string|undefined>}
 */
async function getAvailableApiKey() {
  const apiKey = getApiKey()
  if (!apiKey) return undefined

  const now = Date.now()
  if (
    apiKeyProbeCache.key === apiKey &&
    now - apiKeyProbeCache.checkedAt < API_KEY_PROBE_TTL_MS
  ) {
    return apiKeyProbeCache.ok ? apiKey : undefined
  }

  const isAvailable = await silentTestApiKey(apiKey)
  // Falha: TTL curto (rede/503 transitório). Sucesso: TTL longo.
  apiKeyProbeCache = {
    key: apiKey,
    ok: isAvailable,
    checkedAt: isAvailable ? now : now - API_KEY_PROBE_TTL_MS + 60_000,
  }
  return isAvailable ? apiKey : undefined
}

/**
 * Faz uma chamada à API Gemini com retry automático e fallback de modelo
 * @param {string} prompt - O prompt para enviar à IA
 * @param {Object} options - Opções adicionais
 * @param {number} options.maxRetries - Número máximo de tentativas (padrão: 3)
 * @param {number} options.baseDelay - Delay base em ms (padrão: 2000)
 * @param {Array<string>} options.models - Lista de modelos (padrão: só Flash — sem Pro)
 * @param {Object} options.generationConfig - Configuração de geração (temperature, maxOutputTokens, etc.)
 * @param {boolean} options.useGoogleSearch - Grounding Google Search (padrão: false — cobrado à parte)
 * @param {boolean} options.useRAG - RAG via Custom Search (padrão: false)
 * @param {string} options.ragTopic - Tópico específico para busca RAG (opcional)
 * @param {boolean} options.isLegalContent - Se o conteúdo é jurídico
 * @param {boolean} options.useFunctionCalling - Function Calling (padrão: false)
 * @param {Array} options.tools - Ferramentas customizadas para Function Calling (padrão: [])
 * @param {'minimal'|'low'|'medium'|'high'} options.thinkingLevel - Padrão: low (conteúdo); use minimal em chat
 * @returns {Promise<Object>} - Resposta da API
 */
export async function callGeminiWithRetry(prompt, options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    baseDelay = BASE_DELAY,
    models = MODELS,
    generationConfig = DEFAULT_GENERATION_CONFIG,
    useGoogleSearch = false,
    useRAG = false,
    ragTopic = null,
    isLegalContent = true,
    useFunctionCalling = false,
    tools = [],
    courseId = null,
    courseContext = null,
    verifyContent = false,
    // low: qualidade de material/questões sem o default medium do Gemini 3.6
    thinkingLevel = 'low',
    silent = false,
    purpose = silent ? 'json' : 'generate',
  } = options

  const effectivePurpose = options.purpose || purpose
  const effectiveVerify = Boolean(verifyContent)
  // Em silent, só ativa se o caller pediu explicitamente
  const effectiveGoogleSearch = silent
    ? Boolean(options.useGoogleSearch)
    : Boolean(useGoogleSearch)
  // Não empilhar RAG + Grounding na mesma chamada (custo duplo, contexto redundante)
  const effectiveRAG = silent
    ? Boolean(options.useRAG) && !effectiveGoogleSearch
    : Boolean(useRAG) && !effectiveGoogleSearch

  let courseData = courseContext
  if (!courseData && courseId) {
    courseData = await fetchCourseAiContext(courseId)
  }

  const promptBase = silent ? appendSilentJsonRules(prompt) : prompt
  let enhancedPrompt = buildPromptWithCourseContext(promptBase, courseData)

  if (effectiveRAG) {
    try {
      const searchTopic = ragTopic || extractSearchTopic(prompt)
      if (!silent) {
        console.log(`🔍 RAG: Buscando contexto em fontes oficiais: "${searchTopic.substring(0, 80)}..."`)
      }
      const ragContext = await performRAG(searchTopic, isLegalContent)
      if (ragContext) {
        enhancedPrompt = ragContext + '\n\n' + enhancedPrompt
        if (!silent) console.log('✅ RAG: contexto oficial adicionado ao prompt')
      }
    } catch (error) {
      if (!silent) console.warn('⚠️ RAG: erro na busca, continuando sem RAG:', error.message)
    }
  }

  const response = await executeGeminiRequest(enhancedPrompt, {
    maxRetries,
    baseDelay,
    models,
    generationConfig,
    useGoogleSearch: effectiveGoogleSearch,
    useFunctionCalling,
    tools,
    thinkingLevel,
    silent,
    purpose: effectivePurpose,
    courseId: courseId || null,
  })

  if (!effectiveVerify) return response

  let generatedText = ''
  try {
    generatedText = extractGeneratedText(response)
  } catch {
    return response
  }

  if (!shouldRunVerification(generatedText, { verifyContent, isLegalContent })) {
    return response
  }

  // Se a geração já usou Grounding, a verificação NÃO paga grounding de novo
  const verifyWithSearch = !effectiveGoogleSearch
  console.log(
    `🔎 Verificação jurídica pós-geração (Flash, grounding=${verifyWithSearch})...`,
  )
  try {
    const verifyPrompt = buildVerificationPrompt(generatedText, courseData || {})
    const verifyResponse = await executeGeminiRequest(verifyPrompt, {
      models: VERIFY_MODELS,
      generationConfig: VERIFY_GENERATION_CONFIG,
      useGoogleSearch: verifyWithSearch,
      thinkingLevel: 'minimal',
      purpose: 'verify',
      courseId: courseId || null,
    })
    const verifyText = extractGeneratedText(verifyResponse)
    const verification = parseVerificationResult(verifyText)

    if (!verification.aprovado) {
      console.warn(
        `⚠️ Verificação encontrou ${verification.problemas?.length || 0} problema(s); aplicando correções.`
      )
    } else {
      console.log('✅ Conteúdo aprovado na verificação jurídica')
    }

    return applyVerificationToResponse(response, verification, generatedText)
  } catch (verifyErr) {
    console.warn('⚠️ Verificação jurídica falhou, mantendo texto original:', verifyErr.message)
    return response
  }
}

/**
 * Execução bruta da API Gemini (sem contexto de curso nem verificação).
 */
async function executeGeminiRequest(prompt, options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    baseDelay = BASE_DELAY,
    models = MODELS,
    generationConfig = DEFAULT_GENERATION_CONFIG,
    useGoogleSearch = false,
    useFunctionCalling = false,
    tools = [],
    thinkingLevel = 'low',
    silent = false,
    purpose = 'generate',
    courseId = null,
  } = options

  const finalPrompt = prompt

  // Probe da key com cache (não a cada request)
  let apiKey = await getAvailableApiKey()

  // Sem key no cliente (comum no Next/Vercel) → proxy server-side
  if (!apiKey && typeof window !== 'undefined') {
    if (!silent) console.log('🔑 Nenhuma key no cliente — usando /api/gemini/generate')
    return callGeminiViaServer(finalPrompt, {
      generationConfig,
      useGoogleSearch,
      useFunctionCalling,
      tools,
      models,
      thinkingLevel,
      silent,
      purpose,
      courseId,
    })
  }

  if (!apiKey) {
    throw new Error(
      'Nenhuma API key do Gemini configurada. Defina VITE_GEMINI_API_KEY no .env.local (local) ou nas variáveis do Vercel.'
    )
  }

  if (!silent) {
    console.log('🔑 Usando VITE_GEMINI_API_KEY')
    if (useGoogleSearch) console.log(`🔍 Google Search Grounding ativado`)
    if (useFunctionCalling) console.log(`🔧 Function Calling ativado com ${tools.length} ferramentas`)
  }

  let lastError = null

  for (const model of models) {
    if (!silent) console.log(`🔄 Tentando modelo: ${model}`)

    try {
      const safeConfig = withCostSafeThinking(generationConfig, model, thinkingLevel)
      const requestBody = {
        contents: [{ parts: [{ text: finalPrompt }] }],
        generationConfig: safeConfig,
      }

      // Grounding só quando explicitamente pedido (taxa extra por requisição)
      if (useGoogleSearch) {
        requestBody.tools = [{ googleSearch: {} }]
      }

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

        // thinkingConfig inválido em algum modelo → retry sem thinkingConfig
        if (
          response.status === 400 &&
          /thinking/i.test(errorMessage) &&
          safeConfig.thinkingConfig
        ) {
          if (!silent) {
            console.warn(`⚠️ ${model}: thinkingConfig rejeitado, repetindo sem ele...`)
          }
          const retryBody = {
            ...requestBody,
            generationConfig: { ...generationConfig },
          }
          delete retryBody.generationConfig.thinkingConfig
          const retryRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(retryBody),
            }
          )
          const retryData = await retryRes.json()
          if (retryRes.ok) {
            if (!silent) console.log(`✅ Sucesso com modelo ${model} (sem thinkingConfig)`)
            void trackGeminiUsage({
              response: retryData,
              model,
              purpose,
              courseId,
            })
            return retryData
          }
        }

        // 429/503/404 → próximo modelo (cascade só Flash por padrão)
        if (response.status === 429 || response.status === 503 || response.status === 404) {
          if (!silent) console.log(`⚠️ Modelo ${model} com erro (${response.status}), tentando próximo...`)
          lastError = new Error(errorMessage)
          if (response.status === 429) lastError.code = 'quota_exceeded'
          continue
        }

        const err = new Error(errorMessage)
        if (response.status === 429) err.code = 'quota_exceeded'
        throw err
      }

      if (!silent) console.log(`✅ Sucesso com modelo ${model}`)
      void trackGeminiUsage({
        response: data,
        model,
        purpose,
        courseId,
      })
      return data

    } catch (error) {
      lastError = error
      if (!silent) console.error(`❌ Erro com modelo ${model}:`, error.message)
    }
  }

  // Se chegou aqui, todos os modelos falharam
  if (typeof window !== 'undefined') {
    try {
      if (!silent) console.log('🔄 Tentando proxy server-side /api/gemini/generate...')
      return await callGeminiViaServer(finalPrompt, {
        generationConfig,
        useGoogleSearch,
        useFunctionCalling,
        tools,
        models,
        thinkingLevel,
        silent,
        purpose,
        courseId,
      })
    } catch (serverErr) {
      lastError = serverErr
    }
  }

  const finalErr = new Error(
    `Todos os modelos falharam. Último erro: ${lastError?.message || 'Erro desconhecido'}`
  )
  if (isGeminiQuotaError(lastError)) finalErr.code = 'quota_exceeded'
  throw finalErr
}

/**
 * Extrai o texto gerado da resposta da API
 * @param {Object} response - Resposta da API Gemini
 * @returns {string} - Texto gerado
 */
export function extractGeneratedText(response) {
  const parts = response.candidates?.[0]?.content?.parts || []
  // Ignora parts de thought (thinking tokens) — só o texto visível conta para o app
  const generatedText = parts
    .filter((part) => part && typeof part.text === 'string' && !part.thought)
    .map((part) => part.text)
    .join('')
    .trim()

  if (!generatedText) {
    const err = new Error('A IA não retornou texto')
    err.code = 'ai_empty_response'
    throw err
  }

  return generatedText
}

/** Motivo de parada do Gemini (ex.: MAX_TOKENS = texto cortado). */
export function getGeminiFinishReason(response) {
  return String(response?.candidates?.[0]?.finishReason || response?.candidates?.[0]?.finish_reason || '')
}

export function wasGeminiTruncated(response) {
  const reason = getGeminiFinishReason(response).toUpperCase()
  return reason === 'MAX_TOKENS' || reason === 'LENGTH'
}

/** True se há pelo menos uma chave Gemini configurada no ambiente. */
export function hasGeminiApiKeys() {
  return Boolean(getApiKey())
}

/**
 * Chamada silenciosa + parse JSON robusto (uso padrão em todas as gerações).
 * Se a resposta for cortada (MAX_TOKENS), continua automaticamente até completar o JSON.
 */
export async function generateAiJson(prompt, options = {}) {
  const maxContinues = options.maxContinues ?? 3
  const {
    maxContinues: _mc,
    rejectTruncated = true,
    ...callOptions
  } = options

  const baseCallOpts = {
    useRAG: false,
    useGoogleSearch: false,
    verifyContent: false,
    thinkingLevel: 'minimal',
    ...callOptions,
    silent: true,
  }

  let response = await callGeminiWithRetry(prompt, baseCallOpts)
  let fullText = extractGeneratedText(response)
  let continues = 0

  while (wasGeminiTruncated(response) && continues < maxContinues) {
    continues += 1
    console.warn(
      `⚠️ Resposta Gemini truncada (MAX_TOKENS). Continuando JSON (${continues}/${maxContinues})...`,
    )
    const continuePrompt = `Continue EXATAMENTE de onde o JSON abaixo parou.
Não repita o trecho já escrito.
Não adicione markdown, comentários ou texto fora do JSON.
Complete até fechar todas as chaves e colchetes, gerando um JSON 100% válido e completo.

JSON PARCIAL (continue a partir do final):
${fullText.slice(-8000)}`

    response = await callGeminiWithRetry(continuePrompt, {
      ...baseCallOpts,
      useGoogleSearch: false,
      verifyContent: false,
      useRAG: false,
      generationConfig: {
        ...(baseCallOpts.generationConfig || {}),
        maxOutputTokens:
          baseCallOpts.generationConfig?.maxOutputTokens || DEFAULT_GENERATION_CONFIG.maxOutputTokens,
        temperature: Math.min(0.2, baseCallOpts.generationConfig?.temperature ?? 0.2),
      },
    })
    const chunk = extractGeneratedText(response)
    fullText = mergeJsonContinuation(fullText, chunk)
  }

  const stillTruncated = wasGeminiTruncated(response)

  try {
    const parsed = await parseAiJsonText(fullText)
    if (parsed?.erro) {
      const err = new Error(String(parsed.erro))
      err.code = 'ai_generation_error'
      throw err
    }
    return parsed
  } catch (error) {
    if (isGeminiQuotaError(error)) throw error
    if (error?.code === 'ai_generation_error') throw error
    if (stillTruncated && rejectTruncated) {
      const err = new Error(
        'A geração foi cortada pelo limite de tokens e o conteúdo ficou incompleto. Tente novamente.',
      )
      err.code = 'ai_truncated'
      err.cause = error
      throw err
    }
    const err = new Error(formatAiErrorForUser(error))
    err.code = error.code || 'ai_json_parse_error'
    err.cause = error
    throw err
  }
}

/** Une o texto parcial com o chunk de continuação, evitando duplicação grosseira. */
function mergeJsonContinuation(previous = '', chunk = '') {
  const prev = String(previous || '')
  const next = String(chunk || '').trim()
  if (!next) return prev

  // Se o chunk já contém um JSON completo que inclui o início, prefira o maior parseável
  const nextClean = next
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim()

  // Overlap: se o final do prev aparece no início do next, corte a duplicata
  const maxOverlap = Math.min(400, prev.length, nextClean.length)
  for (let size = maxOverlap; size >= 40; size -= 1) {
    const suffix = prev.slice(-size)
    if (nextClean.startsWith(suffix)) {
      return prev + nextClean.slice(size)
    }
  }

  // Se o modelo recomeçou o objeto/array, tente anexar só o que falta
  if (
    (nextClean.startsWith('{') || nextClean.startsWith('[')) &&
    (prev.includes('{') || prev.includes('['))
  ) {
    return prev + nextClean.replace(/^[\s\S]*?(?=[,\]\}])/, '')
  }

  return `${prev}${nextClean}`
}

export async function parseAiJsonText(generatedText) {
  if (!generatedText || typeof generatedText !== 'string') {
    throw new Error('Texto da IA inválido')
  }

  const cleaned = stripConversationalWrapper(
    generatedText
      .replace(/```json\s*/gi, '')
      .replace(/```/g, '')
      .trim()
  )

  const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error('Nenhum JSON válido encontrado na resposta')
  }

  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return await repairJsonText(jsonMatch[0])
  }
}

/**
 * Extrai e parseia JSON da resposta da API
 * @param {Object} response - Resposta da API Gemini
 * @returns {Object} - Objeto JSON parseado
 */
export async function extractJsonFromResponse(response) {
  const generatedText = extractGeneratedText(response)
  return parseAiJsonText(generatedText)
}

/**
 * Repara JSON malformado retornado pela IA (fallback robusto).
 */
export async function repairJsonText(raw) {
  const attempts = [
    (s) => JSON.parse(s),
    async (s) => {
      const mod = await import('jsonrepair')
      const repairFn = mod.jsonrepair || mod.default
      if (typeof repairFn !== 'function') throw new Error('jsonrepair indisponível')
      return JSON.parse(repairFn(s))
    },
    (s) => JSON.parse(s.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001F]+/g, ' ')),
  ]

  let lastError
  for (const attempt of attempts) {
    try {
      return await attempt(raw)
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Não foi possível reparar o JSON da resposta')
}

/**
 * Testa o status de uma API key do Gemini
 * @param {string} apiKey - A API key para testar
 * @returns {Promise<Object>} - Status da key
 */
async function testApiKey(apiKey) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_MODEL}:generateContent?key=${apiKey}`,
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
 * Verifica o status da API key do Gemini
 * @returns {Promise<Array<Object>>} - Lista de status das keys
 */
export async function checkGeminiApiKeysStatus() {
  const apiKey = getApiKey()

  if (!apiKey) {
    return [
      {
        name: 'Configuração',
        keyPreview: '—',
        status: 'missing',
        message:
          'Nenhuma chave encontrada. Configure VITE_GEMINI_API_KEY no .env.local ou no painel do Vercel e faça redeploy.',
      },
    ]
  }

  console.log('🔍 Testando VITE_GEMINI_API_KEY...')
  const status = await testApiKey(apiKey)

  return [
    {
      name: 'VITE_GEMINI_API_KEY',
      keyPreview: apiKey.substring(0, 10) + '...',
      ...status,
    },
  ]
}
