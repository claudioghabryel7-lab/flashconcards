/**
 * Pipeline confiável de geração — Google Search + validação + auditoria seletiva (fail-closed).
 * Custo baixo: auditoria só quando há citações legais; Pro não usado aqui.
 */

const { callGemini, parseAiJsonText, extractGeneratedText, collectTextFromGeminiResponse } = require('./geminiServer')
const { hasGroundingSupport } = require('./groundingUtils')
const { isLikelyLegalDiscipline, textHasLegalClaims } = require('./unifiedLegalTravas')
const {
  buildVerificationPrompt,
  parseVerificationResult,
  shouldRunVerification,
} = require('./contentVerification')
const { validateConteudoCompletoPayload } = require('./conteudoCompletoValidate')
const { validateQuestoesPayload } = require('./questoesValidate')
const { validateFlashcardsList } = require('./flashcardsValidate')
const { runWithHeartbeat } = require('./generationJobResume')

const TRUSTED_GENERATION_CONFIG = {
  temperature: 0.25,
  maxOutputTokens: 32000,
}

const VERIFY_GENERATION_CONFIG = {
  temperature: 0,
  maxOutputTokens: 8192,
}

function buildTrustedOptions(options = {}) {
  return {
    useGoogleSearch: true,
    useRAG: true,
    generationConfig: {
      ...TRUSTED_GENERATION_CONFIG,
      ...(options.generationConfig || {}),
    },
    rejectTruncatedJson: options.rejectTruncatedJson ?? options.contentType === 'material',
    maxParseAttempts: options.maxParseAttempts ?? 4,
    ...options,
  }
}

function assertValidation(contentType, parsed, context = {}) {
  if (contentType === 'material') {
    const v = validateConteudoCompletoPayload(parsed)
    if (!v.ok) {
      const err = new Error(`Material inválido — ${v.errors.join(' ')}`)
      err.code = 'material_incomplete'
      throw err
    }
    const embedded = parsed?.questoesPreditivas || []
    if (embedded.length > 0) {
      const qv = validateQuestoesPayload(
        { questoes: embedded },
        { expectedCount: embedded.length, banca: context.banca },
      )
      if (!qv.ok) {
        const err = new Error(`Questões embutidas inválidas — ${qv.errors.slice(0, 5).join(' ')}`)
        err.code = 'questoes_invalid'
        throw err
      }
    }
    return
  }

  if (contentType === 'questoes') {
    const v = validateQuestoesPayload(parsed, {
      expectedCount: context.expectedCount ?? 50,
      banca: context.banca,
      tipoProva: context.tipoProva,
    })
    if (!v.ok) {
      const err = new Error(`Questões inválidas — ${v.errors.slice(0, 8).join(' ')}`)
      err.code = 'questoes_invalid'
      throw err
    }
    return
  }

  if (contentType === 'flashcards') {
    const list = parsed?.flashcards || []
    const v = validateFlashcardsList(list, context.flashcardLimits || {})
    if (!v.ok) {
      const err = new Error(`Flashcards inválidos — ${v.errors.slice(0, 8).join(' ')}`)
      err.code = 'flashcards_invalid'
      throw err
    }
  }
}

function requireGroundingIfNeeded(response, textSample, context = {}) {
  const disciplina = context.disciplina || ''
  if (!isLikelyLegalDiscipline(disciplina)) return
  if (!textHasLegalClaims(textSample)) return
  if (hasGroundingSupport(response)) return

  const err = new Error(
    'Conteúdo jurídico gerado sem consulta Google Search (grounding). Regeneração necessária.',
  )
  err.code = 'grounding_required'
  throw err
}

async function runLegalAudit(textSample, courseContext = {}) {
  if (!shouldRunVerification(textSample, { isLegalContent: true })) {
    return { aprovado: true, parsed: null }
  }

  const verifyPrompt = buildVerificationPrompt(textSample, courseContext)
  const verifyResponse = await callGemini(verifyPrompt, {
    useGoogleSearch: true,
    generationConfig: VERIFY_GENERATION_CONFIG,
  })
  const verifyText = extractGeneratedText(verifyResponse)
  const verification = parseVerificationResult(verifyText)
  return { ...verification, verifyResponse }
}

async function tryApplyCorrection(originalParsed, verification, contentType) {
  if (verification.aprovado || !verification.texto_corrigido) return originalParsed
  try {
    const corrected = await parseAiJsonText(verification.texto_corrigido, {
      rejectTruncated: contentType === 'material',
    })
    return corrected
  } catch {
    return originalParsed
  }
}

async function generateTrustedJson(prompt, options = {}, context = {}) {
  const opts = buildTrustedOptions(options)
  const contentType = opts.contentType || context.contentType || ''
  const courseContext = context.courseContext || {
    banca: context.banca,
    concursoName: context.concursoName || context.courseName,
    disciplina: context.disciplina,
  }

  let lastError
  const maxAttempts = opts.maxParseAttempts ?? 4

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const effectivePrompt =
        attempt === 1
          ? prompt
          : `${prompt}\n\nIMPORTANTE: resposta anterior inválida (${lastError?.message || 'erro'}). Retorne APENAS JSON válido e completo. Use Google Search para leis/artigos.`

      const response = await callGemini(effectivePrompt, opts)
      let { text, finishReason } = collectTextFromGeminiResponse(response)
      if (!text) text = extractGeneratedText(response)

      if (opts.rejectTruncatedJson && finishReason === 'MAX_TOKENS') {
        const err = new Error('Resposta truncada (MAX_TOKENS).')
        err.code = 'ai_json_truncated'
        throw err
      }

      let parsed = await parseAiJsonText(text, { rejectTruncated: Boolean(opts.rejectTruncatedJson) })
      if (parsed?.erro) throw new Error(String(parsed.erro))

      requireGroundingIfNeeded(response, JSON.stringify(parsed), context)

      assertValidation(contentType, parsed, context)

      const audit = await runLegalAudit(JSON.stringify(parsed), courseContext)
      if (!audit.aprovado) {
        parsed = await tryApplyCorrection(parsed, audit, contentType)
        assertValidation(contentType, parsed, context)
        const audit2 = await runLegalAudit(JSON.stringify(parsed), courseContext)
        if (!audit2.aprovado) {
          const err = new Error(
            `Auditoria jurídica reprovou: ${(audit2.problemas || audit.problemas || []).slice(0, 3).map((p) => p.motivo || p.status).join('; ')}`,
          )
          err.code = 'legal_audit_failed'
          throw err
        }
      }

      return parsed
    } catch (error) {
      lastError = error
      const retryable =
        error.code === 'ai_json_parse_error' ||
        error.code === 'ai_json_truncated' ||
        error.code === 'ai_empty_response' ||
        error.code === 'material_incomplete' ||
        error.code === 'questoes_invalid' ||
        error.code === 'flashcards_invalid' ||
        error.code === 'grounding_required' ||
        error.code === 'legal_audit_failed'
      if (attempt < maxAttempts && retryable) continue
      throw error
    }
  }

  throw lastError || new Error('Falha na geração confiável.')
}

async function generateTrustedJsonWithJobHeartbeat(
  userId,
  jobId,
  prompt,
  options = {},
  keepAliveMessage = null,
  context = {},
) {
  const { isJobCancelled, touchActiveJob } = require('./generationJobResume')
  const admin = require('firebase-admin')

  return runWithHeartbeat(
    () => generateTrustedJson(prompt, options, context),
    async () => {
      const ts = admin.firestore.FieldValue.serverTimestamp()
      await Promise.all([
        touchActiveJob(userId, jobId, { status: 'running' }),
        admin
          .firestore()
          .doc(`users/${userId}/generationJobs/${jobId}`)
          .update({
            progressUpdatedAt: ts,
            updatedAt: ts,
            ...(keepAliveMessage ? { message: keepAliveMessage } : {}),
          })
          .catch(() => {}),
      ])
    },
    15000,
    async () => isJobCancelled(userId, jobId),
  )
}

module.exports = {
  generateTrustedJson,
  generateTrustedJsonWithJobHeartbeat,
  buildTrustedOptions,
  assertValidation,
}
