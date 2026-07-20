/**
 * Função utilitária para chamadas à API Gemini com retry, fallback e rotação de API keys
 * Resolve erros de alta demanda implementando exponential backoff, modelos alternativos e rotação de múltiplas keys
 * Integra verificação de fontes oficiais para garantir veracidade do conteúdo
 * Implementa RAG (Retrieval-Augmented Generation) com Google Search para evitar alucinações
 */

import { performRAG, googleSearch } from './googleSearch.js'
import { fetchCourseAiContext, buildPromptWithCourseContext } from './courseAiContext.js'
import {
  buildVerificationPrompt,
  buildFactualAuditPrompt,
  buildLegalConfirmPrompt,
  buildFlashcardAuditPrompt,
  buildConsistencyAuditPrompt,
  parseVerificationResult,
  shouldRunVerification,
  applyVerificationToResponse,
  summarizeAuditProblems,
  isLikelyLegalDiscipline,
} from './contentVerification.js'
import { appendSilentJsonRules } from './aiPromptUtils.js'

const MAX_AUDIT_ROUNDS_LEGAL = 4
const MAX_AUDIT_ROUNDS_FACTUAL = 3
import { geminiFetch } from './geminiHttp.js'
import {
  collectGeminiApiKeys,
  geminiRequestWithKeyFallback,
  hasGeminiApiKeys,
  isGeminiQuotaOrUnavailable,
  listGeminiApiKeyEntries,
} from './geminiKeyPool.js'

export { hasGeminiApiKeys, collectGeminiApiKeys as getGeminiApiKeys } from './geminiKeyPool.js'

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
]

const VERIFY_MODELS = ['gemini-2.5-flash']

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

/** Rate limit / quota Gemini (para retry e UI). */
export function isGeminiQuotaError(error) {
  const msg = String(error?.message || error || '').toLowerCase()
  const code = String(error?.code || '').toLowerCase()
  return (
    code.includes('429') ||
    code.includes('quota') ||
    code.includes('rate_limited') ||
    code.includes('resource_exhausted') ||
    isGeminiQuotaOrUnavailable(429, msg) ||
    msg.includes('esgotad') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource has been exhausted')
  )
}

function isHardFreeTierMessage(message = '') {
  const msg = String(message).toLowerCase()
  return (
    msg.includes('free_tier') ||
    msg.includes('free tier') ||
    msg.includes('generate_content_free_tier') ||
    (msg.includes('billing') && (msg.includes('disabled') || msg.includes('not enabled')))
  )
}

export function formatAiErrorForUser(error) {
  if (isGeminiQuotaError(error)) {
    const raw = String(error?.message || '')
    if (isHardFreeTierMessage(raw)) {
      return 'A chave Gemini ainda está no plano gratuito ou sem billing ativo. Ative o faturamento no Google AI Studio / Cloud e use a chave do projeto pago.'
    }
    // 429 / RPM — comum com crédito (auditoria dual + Search). Não é “sem crédito”.
    return 'A API Gemini atingiu o limite temporário de requisições (rate limit). Aguarde alguns segundos e tente de novo — isso pode acontecer mesmo com crédito na conta.'
  }
  const code = String(error?.code || '')
  if (code === 'legal_audit_failed' || code === 'bundle_consistency_failed') {
    return (
      error?.message ||
      'Conteúdo reprovado na auditoria — não foi publicado. Gere novamente.'
    )
  }
  const msg = String(error?.message || error || '')
  if (msg.includes('Nenhum JSON') || msg.includes('reparar o JSON') || msg.includes('formato inválido')) {
    return 'A IA respondeu em formato inválido ou incompleto. Tente gerar novamente.'
  }
  return 'Falha na geração com IA. Tente novamente.'
}

function resolveAiErrorMessage(error) {
  if (!error) return formatAiErrorForUser(error)
  if (isGeminiQuotaError(error)) return formatAiErrorForUser(error)
  if (error.code === 'ai_empty_response' || error.code === 'ai_blocked' || error.code === 'ai_generation_error') {
    return error.message
  }
  const cause = error.cause
  if (cause?.code === 'ai_empty_response' || cause?.code === 'ai_blocked') {
    return cause.message
  }
  return formatAiErrorForUser(error)
}

function isRetryableAiError(error) {
  const code = error?.code
  const msg = String(error?.message || '').toLowerCase()
  return (
    code === 'ai_empty_response' ||
    code === 'ai_json_parse_error' ||
    code === 'legal_audit_failed' ||
    code === 'bundle_consistency_failed' ||
    msg.includes('json') ||
    msg.includes('reparar') ||
    msg.includes('auditoria')
  )
}

function buildAuditFailError(verification, prefix = 'Conteúdo reprovado na auditoria') {
  const detail = summarizeAuditProblems(verification?.problemas)
  const err = new Error(detail ? `${prefix}: ${detail}` : prefix)
  err.code = 'legal_audit_failed'
  err.problemas = verification?.problemas || []
  return err
}

async function runSingleAudit(auditPrompt, silent = false) {
  const verifyResponse = await executeGeminiRequest(auditPrompt, {
    models: VERIFY_MODELS,
    generationConfig: VERIFY_GENERATION_CONFIG,
    useGoogleSearch: true,
    silent,
  })
  return parseVerificationResult(extractGeneratedText(verifyResponse))
}

function pickAuditPrompt(currentText, auditContext, contentType, auditMode) {
  const legal = auditMode === 'legal'
  if (contentType === 'flashcards') {
    return buildFlashcardAuditPrompt(currentText, auditContext, { legal })
  }
  if (legal) return buildVerificationPrompt(currentText, auditContext)
  return buildFactualAuditPrompt(currentText, auditContext)
}

/**
 * Máxima confiabilidade:
 * - Nunca publica com FALSO residual (regenera / bloqueia).
 * - Jurídico: até 4 correções + 2ª auditoria de confirmação.
 * - Não jurídico: auditoria factual leve (datas/conceitos).
 */
async function runFailClosedAuditLoop(response, generatedText, options = {}) {
  const {
    courseData = {},
    contentType = '',
    disciplina = '',
    silent = false,
    auditMode = 'factual',
  } = options

  const legal = auditMode === 'legal'
  const maxRounds = legal ? MAX_AUDIT_ROUNDS_LEGAL : MAX_AUDIT_ROUNDS_FACTUAL
  const auditContext = {
    ...courseData,
    disciplina: disciplina || courseData.disciplina || '',
  }

  let currentResponse = response
  let currentText = generatedText
  let lastVerification = null

  for (let round = 1; round <= maxRounds; round += 1) {
    if (!silent) {
      console.log(
        `🔎 Auditoria ${legal ? 'jurídica' : 'factual'} ${round}/${maxRounds} (Google Search)…`,
      )
    }

    let verification
    try {
      verification = await runSingleAudit(
        pickAuditPrompt(currentText, auditContext, contentType, auditMode),
        silent,
      )
    } catch (auditErr) {
      if (legal) {
        // Jurídico: falha técnica → regenera (não publica às cegas)
        throw buildAuditFailError(
          { problemas: [{ motivo: auditErr?.message || 'auditoria indisponível' }] },
          'Auditoria jurídica indisponível',
        )
      }
      if (!silent) {
        console.warn('⚠️ Auditoria factual indisponível — publicando:', auditErr?.message)
      }
      return currentResponse
    }

    lastVerification = verification

    if (verification.aprovado) {
      // 2ª passagem obrigatória em todo conteúdo auditado (fail-closed)
      try {
        if (!silent) console.log('🔎 Confirmação jurídica (2ª passagem)…')
        const confirm = await runSingleAudit(
          buildLegalConfirmPrompt(currentText, auditContext),
          silent,
        )
        if (!confirm.aprovado) {
          lastVerification = confirm
          if (confirm.texto_corrigido) {
            currentResponse = applyVerificationToResponse(
              currentResponse,
              confirm,
              currentText,
            )
            currentText = confirm.texto_corrigido
            if (round < maxRounds) continue
            throw buildAuditFailError(confirm, 'Confirmação jurídica ainda com FALSO')
          }
          throw buildAuditFailError(confirm, 'Confirmação jurídica apontou FALSO')
        }
      } catch (confirmErr) {
        if (confirmErr?.code === 'legal_audit_failed') throw confirmErr
        // Falha técnica na 2ª passagem → NÃO publica
        throw buildAuditFailError(
          { problemas: [{ motivo: confirmErr?.message || 'confirmação indisponível' }] },
          'Confirmação jurídica indisponível — conteúdo NÃO publicado',
        )
      }

      if (!silent) console.log('✅ Auditoria + confirmação jurídica OK — aprovado')
      return {
        ...currentResponse,
        _verification: {
          ...(currentResponse._verification || {}),
          aprovado: true,
          auditMode,
          dualConfirmed: true,
        },
      }
    }

    // FALSO residual → corrigir
    if (verification.texto_corrigido) {
      if (!silent) {
        console.warn(
          `⚠️ ${verification.falsosCount || 0} FALSO(s) na rodada ${round} — corrigindo…`,
        )
      }
      currentResponse = applyVerificationToResponse(currentResponse, verification, currentText)
      currentText = verification.texto_corrigido
      continue
    }

    // FALSO sem correção → regenerar lote/geração (NÃO publicar)
    throw buildAuditFailError(
      verification,
      'FALSO sem correção automática — regenerando (não publicado)',
    )
  }

  // Ainda há FALSO após todas as correções → NÃO publicar
  throw buildAuditFailError(
    lastVerification,
    'Ainda há FALSO após correções — conteúdo NÃO publicado',
  )
}

function collectTextFromGeminiResponse(response) {
  const candidate = response?.candidates?.[0]
  if (!candidate) {
    const blockReason = response?.promptFeedback?.blockReason
    return {
      text: '',
      finishReason: blockReason || 'NO_CANDIDATES',
      blocked: Boolean(blockReason),
    }
  }

  const parts = candidate.content?.parts || []
  const chunks = []
  for (const part of parts) {
    if (typeof part?.text === 'string' && part.text.trim()) {
      chunks.push(part.text)
    }
  }

  return {
    text: chunks.join('').trim(),
    finishReason: candidate.finishReason || null,
    blocked: false,
  }
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
 * @deprecated use collectGeminiApiKeys from geminiKeyPool
 */
function loadApiKeys() {
  return collectGeminiApiKeys()
}

async function silentTestApiKey(apiKey) {
  const { silentProbeGeminiKey } = await import('./geminiKeyPool.js')
  return silentProbeGeminiKey(apiKey)
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
  return data
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
    generationConfig = DEFAULT_GENERATION_CONFIG,
    useGoogleSearch = false,
    useRAG = options.isLegalContent !== false,
    ragTopic = null,
    isLegalContent = true,
    useFunctionCalling = false,
    tools = [],
    courseId = null,
    courseContext = null,
    verifyContent = true,
    silent = false,
    forceAudit = false,
    contentType = '',
    disciplina = '',
    auditMode: auditModeOption = null,
  } = options

  const trusted = Boolean(options.trustedGeneration)
  const effectiveVerify = silent && !trusted ? false : Boolean(verifyContent || trusted)
  const effectiveRAG = silent && !trusted ? Boolean(options.useRAG) : useRAG
  const effectiveGoogleSearch =
    silent && !trusted ? Boolean(options.useGoogleSearch) : useGoogleSearch || trusted

  let courseData = courseContext
  if (!courseData && courseId) {
    courseData = await fetchCourseAiContext(courseId)
  }

  const resolvedDisciplina = disciplina || courseData?.disciplina || options.disciplina || ''
  const legalByDiscipline = isLikelyLegalDiscipline(resolvedDisciplina)
  // Trusted / forceAudit: sempre modo jurídico dual (flashcards, material, questões)
  const forceLegalDual = Boolean(trusted || forceAudit || auditModeOption === 'legal')
  const effectiveIsLegal = forceLegalDual || isLegalContent === true || legalByDiscipline
  const auditMode =
    forceLegalDual || auditModeOption === 'legal'
      ? 'legal'
      : auditModeOption || (effectiveIsLegal ? 'legal' : trusted || forceAudit ? 'factual' : null)

  const promptBase = silent && !trusted ? appendSilentJsonRules(prompt) : prompt
  let enhancedPrompt = buildPromptWithCourseContext(promptBase, courseData)

  if (effectiveRAG) {
    try {
      const searchTopic = ragTopic || extractSearchTopic(prompt)
      if (!silent) {
        console.log(`🔍 RAG: Buscando contexto em fontes oficiais: "${searchTopic.substring(0, 80)}..."`)
      }
      const ragContext = await performRAG(searchTopic, effectiveIsLegal)
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

  const mustAudit = shouldRunVerification(generatedText, {
    verifyContent: true,
    isLegalContent: effectiveIsLegal,
    forceAudit: forceAudit || Boolean(auditMode),
    auditMode,
    disciplina: resolvedDisciplina,
  })

  if (!mustAudit) return response

  try {
    return await runFailClosedAuditLoop(response, generatedText, {
      courseData: courseData || {},
      contentType,
      disciplina: resolvedDisciplina,
      silent,
      auditMode: auditMode || (effectiveIsLegal ? 'legal' : 'factual'),
    })
  } catch (verifyErr) {
    // Nunca soft-pass com FALSO residual. Soft-pass só em falha técnica na última tentativa factual.
    const isTechnical =
      String(verifyErr?.message || '').includes('indisponível') &&
      !(verifyErr?.problemas || []).some(
        (p) => String(p?.status || '').toUpperCase() === 'FALSO',
      )
    if (options.auditSoftPassOnFail && !effectiveIsLegal && isTechnical) {
      console.warn('⚠️ Auditoria factual técnica falhou — publicando:', verifyErr.message)
      return response
    }
    const err = new Error(verifyErr.message || 'Auditoria apontou FALSO — não publicado')
    err.code = verifyErr.code || 'legal_audit_failed'
    err.problemas = verifyErr.problemas
    throw err
  }
}

/**
 * Execução bruta da API Gemini (sem contexto de curso nem verificação).
 */
async function executeGeminiRequest(prompt, options = {}) {
  const {
    models = MODELS,
    generationConfig = DEFAULT_GENERATION_CONFIG,
    useGoogleSearch = false,
    useFunctionCalling = false,
    tools = [],
    silent = false,
  } = options

  const finalPrompt = prompt

  if (!hasGeminiApiKeys() && typeof window !== 'undefined') {
    if (!silent) console.log('🔑 Nenhuma key no cliente — usando /api/gemini/generate')
    return callGeminiViaServer(finalPrompt, {
      generationConfig,
      useGoogleSearch,
      useFunctionCalling,
      tools,
      models,
      silent,
    })
  }

  if (!hasGeminiApiKeys()) {
    throw new Error(
      'Nenhuma API key do Gemini configurada. Defina VITE_GEMINI_API_KEY no .env.local (local) ou nas variáveis do Vercel.',
    )
  }

  if (!silent) {
    console.log(`🔑 ${loadApiKeys().length} API key(s) Gemini configurada(s)`)
    if (useGoogleSearch) console.log('🔍 Google Search Grounding ativado')
    if (useFunctionCalling) console.log(`🔧 Function Calling ativado com ${tools.length} ferramentas`)
  }

  try {
    const { data } = await geminiRequestWithKeyFallback({
      models,
      silent,
      buildBody: (model) => {
        const requestBody = {
          contents: [{ parts: [{ text: finalPrompt }] }],
          generationConfig,
        }

        if (useGoogleSearch) {
          requestBody.tools = [{ googleSearch: {} }]
        }

        if (useFunctionCalling && tools.length > 0) {
          requestBody.tools = requestBody.tools || []
          requestBody.tools.push(...tools)
        }

        return requestBody
      },
    })

    return data
  } catch (clientErr) {
    if (typeof window !== 'undefined') {
      try {
        if (!silent) console.log('🔄 Tentando proxy server-side /api/gemini/generate...')
        return await callGeminiViaServer(finalPrompt, {
          generationConfig,
          useGoogleSearch,
          useFunctionCalling,
          tools,
          models,
          silent,
        })
      } catch (serverErr) {
        const finalErr = new Error(
          `Todas as API keys falharam. Último erro: ${serverErr?.message || clientErr?.message || 'Erro desconhecido'}`,
        )
        if (isGeminiQuotaError(serverErr) || isGeminiQuotaError(clientErr)) {
          finalErr.code = 'quota_exceeded'
        }
        throw finalErr
      }
    }

    const finalErr = new Error(
      `Todas as API keys falharam. Último erro: ${clientErr?.message || 'Erro desconhecido'}`,
    )
    if (isGeminiQuotaError(clientErr)) finalErr.code = 'quota_exceeded'
    throw finalErr
  }
}

/**
 * Extrai o texto gerado da resposta da API
 * @param {Object} response - Resposta da API Gemini
 * @returns {string} - Texto gerado
 */
export function extractGeneratedText(response) {
  const { text, finishReason, blocked } = collectTextFromGeminiResponse(response)

  if (!text) {
    let message = 'A IA não retornou texto'
    if (blocked) {
      message = `Conteúdo bloqueado pela IA (${finishReason}). Tente gerar novamente.`
    } else if (finishReason === 'MAX_TOKENS') {
      message =
        'A IA atingiu o limite de tamanho e não completou o material. Tente gerar novamente.'
    } else if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
      message = 'A IA bloqueou parte do conteúdo por segurança. Tente gerar novamente.'
    } else if (finishReason === 'NO_CANDIDATES') {
      message = 'A IA não retornou resposta. Tente gerar novamente.'
    }

    const err = new Error(message)
    err.code = blocked ? 'ai_blocked' : 'ai_empty_response'
    err.finishReason = finishReason
    throw err
  }

  if (finishReason === 'MAX_TOKENS') {
    console.warn('⚠️ Resposta da IA truncada (MAX_TOKENS) — tentando reparar JSON parcial')
  }

  return text
}

/**
 * Chamada silenciosa + parse JSON robusto (uso padrão em todas as gerações).
 */
/**
 * Auditoria cruzada FC + material + questões (com Google Search).
 * Fail-closed: lança se houver contradição.
 */
export async function auditTopicBundleConsistency({
  flashcards = [],
  materialSample = '',
  questoesSample = '',
  courseContext = {},
} = {}) {
  const fcSample = (flashcards || [])
    .slice(0, 12)
    .map((c, i) => `${i + 1}. F: ${c.frente || c.pergunta}\n   V: ${c.verso || c.resposta}`)
    .join('\n')

  const prompt = buildConsistencyAuditPrompt({
    flashcardsSample: fcSample,
    materialSample: String(materialSample || '').slice(0, 6000),
    questoesSample: String(questoesSample || '').slice(0, 6000),
    courseContext,
  })

  const response = await executeGeminiRequest(prompt, {
    models: VERIFY_MODELS,
    generationConfig: VERIFY_GENERATION_CONFIG,
    useGoogleSearch: true,
  })
  const text = extractGeneratedText(response)
  const result = parseVerificationResult(text)
  if (!result.aprovado) {
    if (isLikelyLegalDiscipline(courseContext.disciplina || '')) {
      const err = new Error(
        `Inconsistência FALSA no pacote jurídico: ${summarizeAuditProblems(result.problemas)}`,
      )
      err.code = 'bundle_consistency_failed'
      err.problemas = result.problemas
      throw err
    }
    console.warn(
      '[bundle] inconsistência factual (seguindo):',
      summarizeAuditProblems(result.problemas),
    )
    return { ...result, softApproved: true, blocked: false }
  }
  return result
}

export async function generateAiJson(prompt, options = {}) {
  const trusted = Boolean(options.trustedGeneration)
  const legal =
    options.auditMode === 'legal' ||
    options.isLegalContent === true ||
    isLikelyLegalDiscipline(options.disciplina || '')
  // Jurídico: mais regenerações até sair limpo. Factual: 3 tentativas.
  const maxAttempts = options.maxParseAttempts ?? (trusted ? (legal ? 5 : 3) : 2)
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      let effectivePrompt = prompt
      if (attempt > 1) {
        const hint =
          lastError?.code === 'legal_audit_failed'
            ? `A auditoria encontrou FALSO (${lastError.message}). Regenere JSON 100% correto com Google Search. Não repita o erro.`
            : 'a resposta anterior não pôde ser lida. Retorne APENAS um único JSON válido e completo, sem markdown nem texto extra.'
        effectivePrompt = `${prompt}\n\nIMPORTANTE: ${hint}`
      }

      const response = await callGeminiWithRetry(effectivePrompt, {
        ...options,
        silent: !trusted,
        verifyContent: trusted ? true : Boolean(options.verifyContent),
        forceAudit: trusted ? true : Boolean(options.forceAudit),
        auditMode: options.auditMode || (legal ? 'legal' : trusted ? 'factual' : null),
        // Soft-pass técnico só na última tentativa factual — nunca com FALSO
        auditSoftPassOnFail: !legal && attempt >= maxAttempts,
        useRAG: options.useRAG ?? trusted,
        useGoogleSearch: options.useGoogleSearch ?? trusted,
        trustedGeneration: trusted,
      })

      const text = extractGeneratedText(response)
      const parsed = await parseAiJsonText(text)
      if (parsed?.erro) {
        const err = new Error(String(parsed.erro))
        err.code = 'ai_generation_error'
        throw err
      }
      return parsed
    } catch (error) {
      lastError = error
      if (isGeminiQuotaError(error)) throw error
      if (attempt < maxAttempts && isRetryableAiError(error)) continue
      break
    }
  }

  const err = new Error(
    lastError?.code === 'legal_audit_failed'
      ? lastError.message
      : resolveAiErrorMessage(lastError),
  )
  err.code = lastError?.code || 'ai_json_parse_error'
  err.cause = lastError
  throw err
}

function closeTruncatedJson(raw) {
  let s = String(raw).trim()
  s = s.replace(/,\s*"[^"\\]*(?:\\.[^"\\]*)*$/, '')
  s = s.replace(/,\s*$/, '')
  s = s.replace(/:\s*$/, ': null')
  const openBraces = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length
  const openBrackets = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length
  if (openBrackets > 0) s += ']'.repeat(openBrackets)
  if (openBraces > 0) s += '}'.repeat(openBraces)
  return s
}

export async function parseAiJsonText(generatedText) {
  const normalized =
    typeof generatedText === 'string'
      ? generatedText.trim()
      : generatedText == null
        ? ''
        : String(generatedText).trim()

  if (!normalized) {
    const err = new Error('A IA não retornou texto para processar')
    err.code = 'ai_empty_response'
    throw err
  }

  const cleaned = stripConversationalWrapper(
    normalized
      .replace(/```json\s*/gi, '')
      .replace(/```/g, '')
      .trim(),
  )

  const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!jsonMatch) {
    const err = new Error('Nenhum JSON válido encontrado na resposta da IA')
    err.code = 'ai_json_parse_error'
    throw err
  }

  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return repairJsonText(jsonMatch[0])
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
    (s) => JSON.parse(closeTruncatedJson(s)),
    async (s) => {
      const mod = await import('jsonrepair')
      const repairFn = mod.jsonrepair || mod.default
      if (typeof repairFn !== 'function') throw new Error('jsonrepair indisponível')
      return JSON.parse(repairFn(s))
    },
    (s) => JSON.parse(closeTruncatedJson(s).replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001F]+/g, ' ')),
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

  const err = new Error('Não foi possível reparar o JSON da resposta da IA')
  err.code = 'ai_json_parse_error'
  err.cause = lastError
  throw err
}

/**
 * Testa o status de uma API key do Gemini
 * @param {string} apiKey - A API key para testar
 * @returns {Promise<Object>} - Status da key
 */
async function testApiKey(apiKey) {
  try {
    const response = await geminiFetch('gemini-2.5-flash', apiKey, {
      contents: [{ parts: [{ text: 'test' }] }],
      generationConfig: { maxOutputTokens: 10 },
    })

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
  const entries = listGeminiApiKeyEntries()
  const results = []

  if (entries.length === 0) {
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

  for (const entry of entries) {
    const { key, label } = entry
    console.log(`🔍 Testando ${label}...`)
    const status = await testApiKey(key)

    results.push({
      name: label,
      keyPreview: key.substring(0, 10) + '...',
      ...status,
    })
  }

  return results
}
