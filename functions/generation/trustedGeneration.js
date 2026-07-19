/**
 * Pipeline confiável unificado — Google Search + validação + auditoria fail-closed.
 */

const { callGemini, parseAiJsonText, extractGeneratedText, collectTextFromGeminiResponse } = require('./geminiServer')
const { hasGroundingSupport } = require('./groundingUtils')
const { isLikelyLegalDiscipline, textHasLegalClaims } = require('./unifiedLegalTravas')
const {
  buildVerificationPrompt,
  buildFlashcardAuditPrompt,
  parseVerificationResult,
  shouldRunVerification,
} = require('./contentVerification')
const { validateConteudoCompletoPayload, validateMaterialCorePayload, validateMaterialExtrasPayload } = require('./conteudoCompletoValidate')
const { validateQuestoesPayload } = require('./questoesValidate')
const { validateFlashcardsList } = require('./flashcardsValidate')
const { runWithHeartbeat } = require('./generationJobResume')

const TRUSTED_GENERATION_CONFIG = {
  temperature: 0.2,
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
    maxParseAttempts: options.maxParseAttempts ?? 5,
    ...options,
  }
}

function buildCourseContext(context = {}) {
  return {
    banca: context.banca,
    concursoName: context.concursoName || context.courseName,
    cargo: context.cargo,
    disciplina: context.disciplina,
    topicoNome: context.topicoNome,
    forceAudit: context.forceAudit !== false,
    isLegalContent: context.isLegalContent ?? isLikelyLegalDiscipline(context.disciplina),
  }
}

function validateEmbeddedMaterialQuestoes(parsed, context = {}) {
  const embedded = parsed?.questoesPreditivas || []
  if (!embedded.length) return
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

function buildValidationRetryHint(lastError, courseContext = {}) {
  const msg = String(lastError?.message || '')
  const banca = courseContext.banca || ''
  let hint = `Resposta anterior inválida (${msg}). Retorne APENAS JSON válido e completo. Use Google Search. Priorize acertos para a banca ${banca}.`

  if (msg.includes('Certo/Errado') || msg.includes('deve ser C ou E')) {
    hint += ` BANCA CERTO/ERRADO (${banca}): gabarito APENAS "C" (certo) ou "E" (errado) — use campo "correta" ou "respostaCorreta". Proibido A/B/D.`
  }
  if (lastError?.code === 'questoes_invalid') {
    hint += ' Corrija gabarito, alternativas e gabaritoComentado coerente com o gabarito.'
  }
  if (lastError?.code === 'material_incomplete') {
    hint += ' Complete todas as seções exigidas sem truncar o JSON.'
  }
  return hint
}

function assertValidation(contentType, parsed, context = {}) {
  if (contentType === 'material_core') {
    const v = validateMaterialCorePayload(parsed)
    if (!v.ok) {
      const err = new Error(`Material (núcleo) inválido — ${v.errors.join(' ')}`)
      err.code = 'material_incomplete'
      throw err
    }
    return
  }

  if (contentType === 'material_extras') {
    const v = validateMaterialExtrasPayload(parsed)
    if (!v.ok) {
      const err = new Error(`Material (complemento) inválido — ${v.errors.join(' ')}`)
      err.code = 'material_incomplete'
      throw err
    }
    validateEmbeddedMaterialQuestoes(parsed, context)
    return
  }

  if (contentType === 'material') {
    const v = validateConteudoCompletoPayload(parsed)
    if (!v.ok) {
      const err = new Error(`Material inválido — ${v.errors.join(' ')}`)
      err.code = 'material_incomplete'
      throw err
    }
    const embedded = parsed?.questoesPreditivas || []
    if (embedded.length > 0) {
      validateEmbeddedMaterialQuestoes(parsed, context)
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
  const legal = isLikelyLegalDiscipline(disciplina)
  const hasClaims = textHasLegalClaims(textSample)

  if (!legal && !hasClaims) return
  if (hasGroundingSupport(response)) return

  const err = new Error(
    'Conteúdo exige Google Search (grounding) — regeneração necessária.',
  )
  err.code = 'grounding_required'
  throw err
}

async function runContentAudit(textSample, courseContext = {}, contentType = '') {
  if (!shouldRunVerification(textSample, courseContext)) {
    return { aprovado: true, parsed: null }
  }

  const auditPrompt =
    contentType === 'flashcards'
      ? buildFlashcardAuditPrompt(textSample, courseContext)
      : buildVerificationPrompt(textSample, courseContext)

  const verifyResponse = await callGemini(auditPrompt, {
    useGoogleSearch: true,
    generationConfig: VERIFY_GENERATION_CONFIG,
  })
  const verifyText = extractGeneratedText(verifyResponse)
  return { ...parseVerificationResult(verifyText), verifyResponse }
}

async function tryApplyCorrection(originalParsed, verification, contentType) {
  if (verification.aprovado) return originalParsed

  if (!verification.texto_corrigido) {
    const err = new Error(
      `Auditoria reprovou: ${(verification.problemas || [])
        .slice(0, 4)
        .map((p) => p.motivo || p.status)
        .join('; ')}`,
    )
    err.code = 'legal_audit_failed'
    throw err
  }

  try {
    const corrected = await parseAiJsonText(verification.texto_corrigido, {
      rejectTruncated: contentType === 'material',
    })
    return corrected
  } catch (parseErr) {
    const err = new Error(
      `Correção da auditoria inválida: ${parseErr.message || 'JSON ilegível'}`,
    )
    err.code = 'legal_audit_failed'
    throw err
  }
}

async function generateTrustedJson(prompt, options = {}, context = {}) {
  const opts = buildTrustedOptions(options)
  const contentType = opts.contentType || context.contentType || ''
  const courseContext = buildCourseContext(context)

  let lastError
  const maxAttempts = opts.maxParseAttempts ?? 8

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const effectivePrompt =
        attempt === 1
          ? prompt
          : `${prompt}\n\nIMPORTANTE: ${buildValidationRetryHint(lastError, courseContext)}`

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

      requireGroundingIfNeeded(response, JSON.stringify(parsed), courseContext)
      assertValidation(contentType, parsed, context)

      const audit = await runContentAudit(JSON.stringify(parsed), courseContext, contentType)
      if (!audit.aprovado) {
        parsed = await tryApplyCorrection(parsed, audit, contentType)
        assertValidation(contentType, parsed, context)
        const audit2 = await runContentAudit(JSON.stringify(parsed), courseContext, contentType)
        if (!audit2.aprovado) {
          parsed = await tryApplyCorrection(parsed, audit2, contentType)
          assertValidation(contentType, parsed, context)
          const audit3 = await runContentAudit(JSON.stringify(parsed), courseContext, contentType)
          if (!audit3.aprovado) {
            const err = new Error(
              `Auditoria reprovou após correções: ${(audit3.problemas || audit2.problemas || [])
                .slice(0, 3)
                .map((p) => p.motivo || p.status)
                .join('; ')}`,
            )
            err.code = 'legal_audit_failed'
            throw err
          }
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
        error.code === 'legal_audit_failed' ||
        error.code === 'bundle_consistency_failed'
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
