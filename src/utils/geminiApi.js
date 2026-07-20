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
  buildGoogleSearchFilterPrompt,
  parseVerificationResult,
  shouldRunVerification,
  applyVerificationToResponse,
  summarizeAuditProblems,
  isLikelyLegalDiscipline,
  isPhantomAuditProblem,
} from './contentVerification.js'
import { appendSilentJsonRules } from './aiPromptUtils.js'

const MAX_AUDIT_ROUNDS_LEGAL = 2
const MAX_AUDIT_ROUNDS_FACTUAL = 1
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
]

const VERIFY_MODELS = ['gemini-2.5-flash']

const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.35,
  maxOutputTokens: 32000,
  responseMimeType: 'application/json',
}

const VERIFY_GENERATION_CONFIG = {
  temperature: 0,
  maxOutputTokens: 8192,
  responseMimeType: 'application/json',
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
    isGeminiQuotaOrUnavailable(429, msg) ||
    msg.includes('esgotad') ||
    msg.includes('limite')
  )
}

export function formatAiErrorForUser(error) {
  if (isGeminiQuotaError(error)) {
    return 'Cota da API Gemini esgotada ou limite gratuito atingido. Tente novamente mais tarde ou configure outra chave.'
  }
  const code = String(error?.code || '')
  if (code === 'duplicate_generation_job') {
    return error?.message || 'Já existe um job ativo gerando o mesmo conteúdo. Aguarde terminar.'
  }
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
  if (msg.includes('mesmo conteúdo') || msg.includes('job ativo')) {
    return msg
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
  // Auditoria SEMPRE em JSON mode (sem grounding) — Search na auditoria quebrava o JSON
  const verifyResponse = await executeGeminiRequest(auditPrompt, {
    models: VERIFY_MODELS,
    generationConfig: { ...VERIFY_GENERATION_CONFIG, responseMimeType: 'application/json' },
    useGoogleSearch: false,
    silent,
  })
  const raw = extractGeneratedText(verifyResponse)
  let parsed = parseVerificationResult(raw)
  if (parsed.parseError) {
    const repaired = await repairAuditJsonLocal(raw)
    if (repaired && typeof repaired === 'object') {
      parsed = parseVerificationResult(JSON.stringify(repaired))
    }
  }
  return parsed
}

async function repairAuditJsonLocal(raw) {
  const cleaned = String(raw || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim()
  const start = cleaned.search(/\{/)
  if (start < 0) return null
  let s = cleaned.slice(start)
  const openBraces = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length
  const openBrackets = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length
  if (openBrackets > 0) s += ']'.repeat(openBrackets)
  if (openBraces > 0) s += '}'.repeat(openBraces)
  s = s.replace(/,\s*([}\]])/g, '$1')
  try {
    return JSON.parse(s)
  } catch {
    try {
      const mod = await import('jsonrepair')
      const repairFn = mod.jsonrepair || mod.default
      if (typeof repairFn !== 'function') return null
      return JSON.parse(repairFn(s))
    } catch {
      return null
    }
  }
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
 * Máxima confiabilidade com custo controlado:
 * - Jurídico: até 2 correções (+ confirmação só se houve correção).
 * - Não jurídico: 1 auditoria factual leve.
 * - JSON ilegível na auditoria = falha técnica (não regenera conteúdo como FALSO).
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
  let hadCorrection = false

  for (let round = 1; round <= maxRounds; round += 1) {
    if (!silent) {
      console.log(
        `🔎 Auditoria ${legal ? 'jurídica' : 'factual'} ${round}/${maxRounds}…`,
      )
    }

    let verification
    try {
      verification = await runSingleAudit(
        pickAuditPrompt(currentText, auditContext, contentType, auditMode),
        silent,
      )
    } catch (auditErr) {
      // Falha técnica da auditoria NÃO deve matar o conteúdo gerado
      if (!silent) {
        console.warn('⚠️ Auditoria indisponível — publicando conteúdo gerado:', auditErr?.message)
      }
      return {
        ...currentResponse,
        _verification: { aprovado: true, soft: true, auditUnavailable: true, auditMode },
      }
    }

    // Parse da auditoria falhou → tenta outra rodada; no fim publica (jurídico e factual)
    if (verification?.parseError || verification?.aprovado === null) {
      if (round < maxRounds) {
        if (!silent) console.warn('⚠️ Auditoria com JSON inválido — reauditando…')
        continue
      }
      if (!silent) {
        console.warn('⚠️ Auditoria com JSON inválido — publicando conteúdo gerado')
      }
      return {
        ...currentResponse,
        _verification: { aprovado: true, soft: true, auditParseError: true, auditMode },
      }
    }

    lastVerification = verification

    // Só fantasmas de truncagem / estilo → publica
    const realBlocking = (verification.problemas || []).filter(
      (p) =>
        !isPhantomAuditProblem(p) &&
        ['FALSO', 'FORA_DO_TOPICO', 'OFF_TOPIC'].includes(String(p?.status || '').toUpperCase()),
    )
    if (!verification.aprovado && realBlocking.length === 0) {
      if (!silent) console.warn('⚠️ Auditoria só com alertas de amostra — publicando')
      return {
        ...currentResponse,
        _verification: {
          ...(currentResponse._verification || {}),
          aprovado: true,
          soft: true,
          auditMode,
        },
      }
    }

    if (verification.aprovado) {
      // Confirmação jurídica só se houve correção prévia (economiza 1 chamada por lote limpo)
      if (legal && hadCorrection) {
        try {
          const confirm = await runSingleAudit(
            buildLegalConfirmPrompt(currentText, auditContext),
            silent,
          )
          if (confirm?.parseError) {
            if (!silent) console.warn('⚠️ Confirmação ilegível — mantendo 1ª aprovação')
          } else if (!confirm.aprovado) {
            lastVerification = confirm
            if (confirm.texto_corrigido) {
              currentResponse = applyVerificationToResponse(
                currentResponse,
                confirm,
                currentText,
              )
              currentText = typeof confirm.texto_corrigido === 'string'
                ? confirm.texto_corrigido
                : JSON.stringify(confirm.texto_corrigido)
              hadCorrection = true
              if (round < maxRounds) continue
              if (!silent) {
                console.warn('⚠️ Confirmação ainda com alerta — publicando versão corrigida')
              }
            } else if (!silent) {
              console.warn('⚠️ Confirmação apontou FALSO sem correção — mantendo 1ª aprovação')
            }
          }
        } catch (confirmErr) {
          if (!silent) {
            console.warn(
              '⚠️ Confirmação jurídica falhou — mantendo 1ª aprovação:',
              confirmErr?.message,
            )
          }
        }
      }

      if (!silent) console.log('✅ Auditoria limpa — aprovado')
      return {
        ...currentResponse,
        _verification: {
          ...(currentResponse._verification || {}),
          aprovado: true,
          auditMode,
          dualConfirmed: legal && hadCorrection,
        },
      }
    }

    if (verification.texto_corrigido) {
      if (!silent) {
        console.warn(
          `⚠️ ${verification.falsosCount || 0} FALSO(s) na rodada ${round} — corrigindo…`,
        )
      }
      currentResponse = applyVerificationToResponse(currentResponse, verification, currentText)
      currentText =
        typeof verification.texto_corrigido === 'string'
          ? verification.texto_corrigido
          : JSON.stringify(verification.texto_corrigido)
      hadCorrection = true
      continue
    }

    // Sem texto_corrigido: factual publica; jurídico só bloqueia se ainda há rodadas
    if (!legal || round >= maxRounds) {
      if (!silent) {
        console.warn('⚠️ FALSO sem correção automática — publicando melhor versão disponível')
      }
      return {
        ...currentResponse,
        _verification: {
          ...(currentResponse._verification || {}),
          aprovado: true,
          soft: true,
          residualProblems: verification.problemas,
          auditMode,
        },
      }
    }
  }

  // Após todas as rodadas: publica a melhor versão (corrigida se houver), não trava o dia
  if (!silent) {
    console.warn(
      '⚠️ Auditoria residual após correções — publicando melhor versão:',
      summarizeAuditProblems(lastVerification?.problemas),
    )
  }
  return {
    ...currentResponse,
    _verification: {
      ...(currentResponse._verification || {}),
      aprovado: true,
      soft: true,
      residualProblems: lastVerification?.problemas || [],
      auditMode,
    },
  }
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
    useRAG = false,
    ragTopic = null,
    isLegalContent = false,
    useFunctionCalling = false,
    tools = [],
    courseId = null,
    courseContext = null,
    verifyContent = false,
    silent = false,
    forceAudit = false,
    contentType = '',
    disciplina = '',
    auditMode: auditModeOption = null,
  } = options

  const trusted = Boolean(options.trustedGeneration)
  // Geração NÃO roda auditoria em loop — verificação é Google Search à parte
  const effectiveVerify = Boolean(verifyContent && (forceAudit || options.runLegacyAudit))
  const effectiveGoogleSearch = Boolean(useGoogleSearch)
  const effectiveRAG = Boolean(useRAG) && !effectiveGoogleSearch

  let courseData = courseContext
  if (!courseData && courseId) {
    courseData = await fetchCourseAiContext(courseId)
  }

  const resolvedDisciplina = disciplina || courseData?.disciplina || options.disciplina || ''
  const legalByDiscipline = isLikelyLegalDiscipline(resolvedDisciplina)
  const effectiveIsLegal = isLegalContent === true || legalByDiscipline
  const auditMode =
    auditModeOption || (effectiveIsLegal ? 'legal' : trusted || forceAudit ? 'factual' : null)

  const promptBase = appendSilentJsonRules(prompt)
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

  const generationConfigEffective = {
    ...DEFAULT_GENERATION_CONFIG,
    ...generationConfig,
  }
  if (effectiveGoogleSearch) {
    delete generationConfigEffective.responseMimeType
  } else if (!generationConfigEffective.responseMimeType) {
    generationConfigEffective.responseMimeType = 'application/json'
  }

  const response = await executeGeminiRequest(enhancedPrompt, {
    maxRetries,
    baseDelay,
    models,
    generationConfig: generationConfigEffective,
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
    if (options.auditSoftPassOnFail) {
      console.warn('⚠️ Auditoria legacy falhou — publicando:', verifyErr.message)
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
 * Após gerar: 1 passagem com Google Search.
 * Publica só o que estiver ok; descarta o que for FALSO claro.
 */
export async function filterGeneratedContentWithGoogleSearch({
  content,
  contentType = 'material',
  courseContext = {},
  items = null,
} = {}) {
  const list =
    Array.isArray(items) && items.length
      ? items
      : contentType === 'flashcards'
        ? content?.flashcards || content?.cards || []
        : contentType === 'questoes'
          ? content?.questoes || content?.questions || content?.itens || []
          : null

  const payloadForPrompt =
    list && list.length
      ? JSON.stringify(
          list.map((item, i) => ({
            i,
            ...(contentType === 'flashcards'
              ? {
                  pergunta: item.pergunta || item.frente,
                  resposta: item.resposta || item.verso,
                }
              : item),
          })),
          null,
          0,
        )
      : typeof content === 'string'
        ? content
        : JSON.stringify(content || {})

  const prompt = buildGoogleSearchFilterPrompt(payloadForPrompt, courseContext, contentType)

  let parsed
  try {
    const response = await executeGeminiRequest(prompt, {
      models: VERIFY_MODELS,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 4096,
        // Search + mime conflitam — parse robusto depois
      },
      useGoogleSearch: true,
    })
    const text = extractGeneratedText(response)
    parsed = await parseAiJsonText(text)
  } catch (err) {
    console.warn('[verify] Google Search falhou — publicando tudo:', err?.message)
    return {
      aprovado: true,
      kept: list || content,
      rejected: [],
      soft: true,
    }
  }

  // Documento único (material)
  if (!list) {
    const aprovado = parsed?.aprovado !== false
    return {
      aprovado,
      kept: aprovado ? content : null,
      rejected: aprovado ? [] : [{ motivo: parsed?.motivo || 'reprovado na verificação' }],
      soft: false,
    }
  }

  const okSet = new Set()
  if (Array.isArray(parsed?.indices_ok)) {
    parsed.indices_ok.forEach((i) => {
      const n = Number(i)
      if (Number.isInteger(n) && n >= 0 && n < list.length) okSet.add(n)
    })
  }

  const rejected = []
  if (Array.isArray(parsed?.indices_rejeitados)) {
    for (const r of parsed.indices_rejeitados) {
      const n = Number(r?.indice ?? r?.index ?? r)
      if (!Number.isInteger(n) || n < 0 || n >= list.length) continue
      // Em dúvida o modelo às vezes rejeita tudo — só tira se motivo parecer FALSO
      const motivo = String(r?.motivo || '')
      if (isPhantomAuditProblem({ motivo })) continue
      rejected.push({ indice: n, motivo })
      okSet.delete(n)
    }
  }

  // Se o modelo não listou ok nem rejeitou de forma útil → publica tudo
  if (!okSet.size && !rejected.length) {
    return { aprovado: true, kept: list, rejected: [], soft: true }
  }

  // Se só veio rejeitados, ok = todos menos rejeitados
  if (!okSet.size && rejected.length) {
    const rej = new Set(rejected.map((r) => r.indice))
    list.forEach((_, i) => {
      if (!rej.has(i)) okSet.add(i)
    })
  }

  const kept = list.filter((_, i) => okSet.has(i))
  return {
    aprovado: kept.length > 0,
    kept,
    rejected,
    soft: false,
  }
}

/** @deprecated Prefer filterGeneratedContentWithGoogleSearch — mantido por compat. */
export async function auditTopicBundleConsistency(args = {}) {
  console.warn('[bundle] auditoria cruzada desativada — usando filtro Google Search leve')
  return { aprovado: true, softApproved: true, blocked: false, ...args }
}

export async function generateAiJson(prompt, options = {}) {
  const maxAttempts = options.maxParseAttempts ?? 2
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      let effectivePrompt = prompt
      if (attempt > 1) {
        effectivePrompt = `${prompt}\n\nIMPORTANTE: a resposta anterior não pôde ser lida. Retorne APENAS um único JSON válido e completo, sem markdown nem texto extra.`
      }

      // Só gera — sem auditoria em loop. Verificação = Google Search depois.
      const response = await callGeminiWithRetry(effectivePrompt, {
        ...options,
        silent: !options.trustedGeneration,
        verifyContent: false,
        forceAudit: false,
        useRAG: false,
        useGoogleSearch: false,
        trustedGeneration: Boolean(options.trustedGeneration),
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

  const err = new Error(resolveAiErrorMessage(lastError))
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

/** Extrai o primeiro objeto/array JSON balanceado (evita greedy regex que engole lixo). */
function extractBalancedJson(text = '') {
  const s = String(text)
  const start = s.search(/[\[{]/)
  if (start < 0) return null
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return s.slice(start)
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

  const candidate = extractBalancedJson(cleaned) || cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0]
  if (!candidate) {
    const err = new Error('Nenhum JSON válido encontrado na resposta da IA')
    err.code = 'ai_json_parse_error'
    throw err
  }

  try {
    return JSON.parse(candidate)
  } catch {
    return repairJsonText(candidate)
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
