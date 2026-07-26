/**
 * Chamadas à IA com retry e fallback de modelos.
 * Backend real = Ollama no PC (via /api/gemini/generate ou generateWithOllama).
 * Mantém nomes/formato Gemini para o resto do app não mudar.
 * Browser: proxy autenticado /api/gemini/generate → Ollama.
 * Servidor: generateWithOllama direto.
 */

import { performRAG, googleSearch } from './googleSearch.js'
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
} from './geminiModels.js'
import {
  collectGeminiTextParts,
  getGeminiFinishReason,
  hasUsableGeminiText,
  isLikelyIncompleteJsonText,
  wasGeminiTruncated,
  withLiteThinkingConfig,
} from './geminiResponseUtils.js'

export {
  collectGeminiTextParts,
  getGeminiFinishReason,
  hasUsableGeminiText,
  isLikelyIncompleteJsonText,
  wasGeminiTruncated,
  withLiteThinkingConfig,
} from './geminiResponseUtils.js'

// withLiteThinkingConfig ainda exportado por compat; IA local ignora thinkingConfig.

const MODELS = getDefaultGeminiModels()
const VERIFY_MODELS = VERIFY_GEMINI_MODELS

const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.35,
  maxOutputTokens: 32000,
}

const VERIFY_GENERATION_CONFIG = {
  temperature: 0,
  maxOutputTokens: 8192,
}

const MAX_RETRIES = 1 // Apenas 1 tentativa para economizar quota
const BASE_DELAY = 2000 // 2 segundos

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
  const code = String(error?.code || '')
  if (code === 'ollama_unavailable') {
    return (
      error?.message ||
      'IA local indisponível. Deixe o Ollama rodando no seu PC (OLLAMA_BASE_URL).'
    )
  }
  if (isGeminiQuotaError(error)) {
    return 'IA local sobrecarregada ou indisponível. Confira o Ollama no PC e tente de novo.'
  }

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

async function callGeminiViaServer(prompt, options = {}) {
  const { callGeminiProxy } = await import('./secureLlmClient.js')
  return callGeminiProxy({ prompt, ...options })
}

/**
 * Healthcheck da IA local (Ollama no PC).
 * @returns {Promise<boolean>}
 */
async function isLocalAiReady() {
  if (typeof window !== 'undefined') return true
  try {
    const { isOllamaAvailable } = await import('../lib/ollamaClient.js')
    return await isOllamaAvailable()
  } catch {
    return false
  }
}

/**
 * Faz uma chamada à API Gemini com retry automático e fallback de modelo
 * @param {string} prompt - O prompt para enviar à IA
 * @param {Object} options - Opções adicionais
 * @param {number} options.maxRetries - Número máximo de tentativas (padrão: 3)
 * @param {number} options.baseDelay - Delay base em ms (padrão: 2000)
 * @param {Array<string>} options.models - Lista de modelos (padrão: lite → 3.6-flash → 3.5-flash)
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
    generationConfig = DEFAULT_GENERATION_CONFIG,
    useGoogleSearch = false,
    useRAG = false,
    ragTopic = null,
    isLegalContent = true,
    useFunctionCalling = false,
    tools = [],
    courseId = null,
    courseContext = null,
    verifyContent = true,
    silent = false,
  } = options

  const effectiveVerify = Boolean(verifyContent)
  const effectiveRAG = silent ? Boolean(options.useRAG) : useRAG
  const effectiveGoogleSearch = silent ? Boolean(options.useGoogleSearch ?? useGoogleSearch) : useGoogleSearch

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
    silent,
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

  console.log('🔎 Verificação jurídica pós-geração (1 chamada Flash)...')
  try {
    const verifyPrompt = buildVerificationPrompt(generatedText, courseData || {})
    const verifyResponse = await executeGeminiRequest(verifyPrompt, {
      models: VERIFY_MODELS,
      generationConfig: VERIFY_GENERATION_CONFIG,
      useGoogleSearch: true,
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
 * Execução bruta da IA (sem contexto de curso nem verificação).
 * Browser → proxy /api/gemini/generate → Ollama no PC
 * Servidor → generateWithOllama direto
 */
async function executeGeminiRequest(prompt, options = {}) {
  const {
    models = MODELS,
    generationConfig = DEFAULT_GENERATION_CONFIG,
    useGoogleSearch = true,
    useFunctionCalling = false,
    tools = [],
    silent = false,
  } = options

  const finalPrompt = prompt

  // Browser: proxy autenticado → Ollama no PC (mesmo contrato Gemini)
  if (typeof window !== 'undefined') {
    if (!silent) console.log('🖥️ IA local via /api/gemini/generate → Ollama no PC')
    return callGeminiViaServer(finalPrompt, {
      generationConfig,
      useGoogleSearch: false,
      useFunctionCalling: false,
      tools: [],
      models,
      silent,
    })
  }

  const ready = await isLocalAiReady()
  if (!ready) {
    const err = new Error(
      'IA local indisponível. Deixe o Ollama rodando no PC e confira OLLAMA_BASE_URL / OLLAMA_MODEL.',
    )
    err.code = 'ollama_unavailable'
    throw err
  }

  if (!silent) {
    console.log('🖥️ Usando IA local (Ollama no PC)')
    if (useGoogleSearch) {
      console.log('ℹ️ Google Search Grounding ignorado (IA local)')
    }
    if (useFunctionCalling) {
      console.log(`ℹ️ Function Calling ignorado (IA local), ${tools.length} tool(s)`)
    }
  }

  const { generateWithOllama } = await import('../lib/ollamaClient.js')
  let lastError = null

  for (const model of models) {
    if (!silent) console.log(`🔄 Tentando modelo local: ${model}`)
    try {
      const data = await generateWithOllama(finalPrompt, {
        model,
        generationConfig,
      })
      if (!hasUsableGeminiText(data)) {
        const reason = getGeminiFinishReason(data) || 'EMPTY'
        lastError = new Error(`A IA local não retornou texto (finishReason=${reason}).`)
        lastError.code = 'ai_empty_response'
        continue
      }
      if (!silent) console.log(`✅ Sucesso com modelo local ${model}`)
      return data
    } catch (error) {
      lastError = error
      if (!silent) console.error(`❌ Erro com modelo ${model}:`, error.message)
    }
  }

  const finalErr = new Error(
    `Todos os modelos locais falharam. Último erro: ${lastError?.message || 'Erro desconhecido'}`,
  )
  if (lastError?.code) finalErr.code = lastError.code
  throw finalErr
}

/**
 * Extrai o texto gerado da resposta da API
 * @param {Object} response - Resposta da API Gemini
 * @returns {string} - Texto gerado
 */
export function extractGeneratedText(response) {
  const generatedText = collectGeminiTextParts(response)

  if (!generatedText) {
    const reason = getGeminiFinishReason(response) || 'UNKNOWN'
    const blocked = response?.promptFeedback?.blockReason || response?.promptFeedback?.block_reason
    const err = new Error(
      blocked
        ? `A IA bloqueou a resposta (${blocked}).`
        : `A IA não retornou texto (finishReason=${reason}).`,
    )
    err.code = 'ai_empty_response'
    err.finishReason = reason
    throw err
  }

  return generatedText
}

/** True se a IA local (Ollama) está configurada/disponível no servidor. */
export function hasGeminiApiKeys() {
  // Sempre "configurada" no browser (usa proxy). No servidor, URL padrão já basta.
  return true
}

/**
 * Chamada silenciosa + parse JSON robusto (uso padrão em todas as gerações).
 * Continua se MAX_TOKENS OU JSON ainda aberto (Lite costuma parar com STOP pela metade).
 * Nunca devolve JSON “parseável” mas truncado quando rejectTruncated=true.
 */
export async function generateAiJson(prompt, options = {}) {
  const contentType = String(options.contentType || options?.savePlan?.contentType || '').toLowerCase()
  const isMaterial = contentType === 'material' || contentType === 'conteudo_completo'
  const maxContinues = options.maxContinues ?? (isMaterial ? 8 : 5)
  const {
    maxContinues: _mc,
    rejectTruncated = true,
    ...callOptions
  } = options

  const baseCallOpts = {
    useRAG: false,
    useGoogleSearch: false,
    verifyContent: false,
    ...callOptions,
    silent: true,
  }

  let response = await callGeminiWithRetry(prompt, baseCallOpts)
  let fullText = extractGeneratedText(response)
  let continues = 0

  const needsContinue = () =>
    wasGeminiTruncated(response) || isLikelyIncompleteJsonText(fullText)

  while (needsContinue() && continues < maxContinues) {
    continues += 1
    const why = wasGeminiTruncated(response) ? 'MAX_TOKENS' : 'JSON_INCOMPLETO'
    console.warn(
      `⚠️ Resposta Gemini incompleta (${why}). Continuando JSON (${continues}/${maxContinues})...`,
    )
    const continuePrompt = `Continue EXATAMENTE de onde o JSON abaixo parou.
Não repita o trecho já escrito.
Não adicione markdown, comentários ou texto fora do JSON.
Complete até fechar TODAS as chaves e colchetes, gerando um JSON 100% válido e COMPLETO (não pela metade).

JSON PARCIAL (continue a partir do final):
${fullText.slice(-12000)}`

    response = await callGeminiWithRetry(continuePrompt, {
      ...baseCallOpts,
      useGoogleSearch: false,
      verifyContent: false,
      useRAG: false,
      generationConfig: {
        ...(baseCallOpts.generationConfig || {}),
        maxOutputTokens:
          baseCallOpts.generationConfig?.maxOutputTokens || DEFAULT_GENERATION_CONFIG.maxOutputTokens,
        temperature: Math.min(0.15, baseCallOpts.generationConfig?.temperature ?? 0.15),
      },
    })
    const chunk = extractGeneratedText(response)
    fullText = mergeJsonContinuation(fullText, chunk)
  }

  const stillIncomplete =
    wasGeminiTruncated(response) || isLikelyIncompleteJsonText(fullText)

  try {
    const parsed = await parseAiJsonText(fullText)
    if (parsed?.erro) {
      const err = new Error(String(parsed.erro))
      err.code = 'ai_generation_error'
      throw err
    }
    // Parseou mas ainda truncado → conteúdo pela metade (ex.: 3/6 resumos). Não aceitar.
    if (stillIncomplete && rejectTruncated) {
      const err = new Error(
        'A geração foi cortada e o material ficou incompleto. Continuação esgotada — tente novamente.',
      )
      err.code = 'ai_truncated'
      err.partial = parsed
      throw err
    }
    return parsed
  } catch (error) {
    if (isGeminiQuotaError(error)) throw error
    if (error?.code === 'ai_generation_error' || error?.code === 'ai_truncated') throw error
    if (stillIncomplete && rejectTruncated) {
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

/** Testa se a IA local (Ollama) responde. */
async function testLocalAiStatus() {
  try {
    const ok = await isLocalAiReady()
    if (ok) {
      return {
        status: 'active',
        message: `IA local OK (${GEMINI_FLASH_MODEL})`,
        remainingQuota: 'Ilimitado (seu PC)',
      }
    }
    return {
      status: 'error',
      message: 'Ollama não respondeu',
      error: 'Deixe o Ollama rodando no PC e confira OLLAMA_BASE_URL',
    }
  } catch (error) {
    return {
      status: 'error',
      message: 'Erro ao conectar na IA local',
      error: error.message,
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
 * Verifica o status da IA local (Ollama no PC).
 * @returns {Promise<Array<Object>>}
 */
export async function checkGeminiApiKeysStatus() {
  if (typeof window !== 'undefined') {
    try {
      await callGeminiViaServer('ping', {
        generationConfig: { maxOutputTokens: 8, temperature: 0 },
        useGoogleSearch: false,
        models: [GEMINI_FLASH_MODEL],
        silent: true,
      })
      return [
        {
          name: 'IA local (Ollama no PC)',
          keyPreview: GEMINI_FLASH_MODEL,
          status: 'active',
          message: 'Proxy → Ollama OK',
          remainingQuota: 'Ilimitado (seu PC)',
        },
      ]
    } catch (err) {
      return [
        {
          name: 'IA local (Ollama no PC)',
          keyPreview: '—',
          status: 'missing',
          message:
            err?.message ||
            'Deixe o Ollama rodando no PC. Se o site estiver na Vercel, use um túnel em OLLAMA_BASE_URL.',
        },
      ]
    }
  }

  const status = await testLocalAiStatus()
  return [
    {
      name: 'IA local (Ollama no PC)',
      keyPreview: GEMINI_FLASH_MODEL,
      ...status,
    },
  ]
}
