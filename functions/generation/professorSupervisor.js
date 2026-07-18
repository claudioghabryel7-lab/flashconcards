const admin = require('firebase-admin')
const { generateAiJson } = require('./geminiServer')
const { loadMentoradoAutomationContext } = require('./guiaMentoradoEdital')
const {
  PROFESSOR_ROLES,
  REVIEW_JSON_SCHEMA,
  MIN_CONFIDENCE_AUTO_APPLY,
} = require('./professorSupervisorShared')
const {
  scriptCheckTopicStep,
  loadTopicBundle,
  scriptCheckVespera,
  scriptCheckRedacao,
} = require('./professorSupervisorScripts')
const {
  applyCorrectionsWithSnapshot,
  buildDiffSummary,
  consolidateQuestaoCorrections,
} = require('./professorSupervisorPatches')
const {
  finishQueueItem,
  updateSupervisorActivity,
  scheduleNextRunForItem,
  kickNextSupervisorItem,
  setQueueItemStatus,
  incrementSessionCounter,
} = require('./professorSupervisorQueue')
const {
  scanMaterialTypos,
  buildDigitacaoVerdict,
  applyDigitacaoFixes,
} = require('./professorDigitacao')
const {
  isJobCancelled,
  isJobCancelledError,
  throwIfCancelled,
  pauseJobForResume,
  isApiQuotaError,
  touchActiveJob,
  clearActiveJob,
  runWithHeartbeat,
  generateAiJsonWithJobHeartbeat,
} = require('./generationJobResume')

function getDb() {
  return admin.firestore()
}

function buildProfessorPrompt(role, contextBlock, priorReview = null) {
  const prior = priorReview
    ? `\nANÁLISE ANTERIOR:\n${JSON.stringify(priorReview, null, 2).slice(0, 12000)}\n`
    : ''
  return `${PROFESSOR_ROLES[role].instruction}

${contextBlock}
${prior}

${REVIEW_JSON_SCHEMA}`
}

async function runProfessor(role, contextBlock, priorReview, shouldAbort, userId, jobId) {
  const prompt = buildProfessorPrompt(role, contextBlock, priorReview)
  if (userId && jobId) {
    return generateAiJsonWithJobHeartbeat(
      userId,
      jobId,
      prompt,
      {
        useRAG: false,
        useGoogleSearch: role === 1,
        generationConfig: { maxOutputTokens: 12000, temperature: 0.25 },
      },
      `Professor ${role} — fiscalizando…`,
    )
  }
  return runWithHeartbeat(
    () =>
      generateAiJson(prompt, {
        useRAG: false,
        useGoogleSearch: role === 1,
        generationConfig: { maxOutputTokens: 12000, temperature: 0.25 },
      }),
    () => {},
    15000,
    shouldAbort,
  )
}

async function runProfessorChain(contextBlock, updateJob, userId, jobId) {
  const shouldAbort = () => isJobCancelled(userId, jobId)

  await updateJob(userId, jobId, { progress: 25, message: 'Professor 1 — fiscalizando…' })
  const p1 = await runProfessor(1, contextBlock, null, shouldAbort, userId, jobId)

  const p1Actionable =
    (p1.issues?.length || 0) > 0 || (p1.corrections?.length || 0) > 0 || p1.needsAdminReview

  if (!p1Actionable && (p1.confidence || 0) >= 0.85) {
    return { final: p1, professorsUsed: 1, skippedHigher: true }
  }

  await updateJob(userId, jobId, { progress: 50, message: 'Professor 2 — revisando correção…' })
  const p2 = await runProfessor(2, contextBlock, p1, shouldAbort, userId, jobId)

  const p2Changed =
    JSON.stringify(p2.corrections || []) !== JSON.stringify(p1.corrections || []) ||
    p2.needsAdminReview

  if (!p2Changed && (p2.confidence || 0) >= 0.8) {
    return { final: p2, professorsUsed: 2, skippedHigher: true }
  }

  await updateJob(userId, jobId, { progress: 75, message: 'Professor 3 — veredito final…' })
  const p3 = await runProfessor(3, contextBlock, p2, shouldAbort, userId, jobId)
  return { final: p3, professorsUsed: 3, skippedHigher: false }
}

async function saveHistory(entry) {
  await getDb().collection('professorSupervisorHistory').add({
    ...entry,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}

async function saveSkipHistory({ courseId, itemType, payload, dedupeKey, reason, summary }) {
  await saveHistory({
    courseId,
    itemType,
    dedupeKey,
    payload,
    skipped: true,
    skipReason: reason,
    verdict: { summary: summary || reason },
    professorsUsed: 0,
    appliedCount: 0,
    reviewId: null,
    autoApplied: false,
  })
}

async function saveAdminReview(entry) {
  const ref = await getDb().collection('professorSupervisorReviews').add({
    ...entry,
    status: 'pending_admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  return ref.id
}

const TOPIC_STEP_MAP = {
  topico_flashcards: 'flashcards',
  topico_material: 'material',
  topico_questoes: 'questoes',
}

function filterCorrectionsForStep(corrections = [], step) {
  if (step === 'flashcards') return corrections.filter((c) => c.target === 'flashcard')
  if (step === 'material') return corrections.filter((c) => c.target === 'material')
  if (step === 'questoes') return corrections.filter((c) => c.target === 'questao')
  return corrections
}

function buildTopicStepContext(step, bundle, payload, context, script) {
  const header = `TIPO: tópico — etapa ${step}
CURSO: ${context.courseName || payload.courseId || ''}
DISCIPLINA: ${payload.disciplina}
TÓPICO: ${payload.topicoNome}
DATA: ${payload.targetDate || ''}

PROBLEMAS DO SCRIPT:
${JSON.stringify(script.issues, null, 2)}
`

  if (step === 'flashcards') {
    const cards = bundle.flashcards.map((c) => ({
      id: c.id,
      frente: (c.frente || c.pergunta || '').slice(0, 250),
      verso: (c.verso || c.resposta || '').slice(0, 500),
    }))
    return `${header}
FLASHCARDS (${cards.length} total):
${JSON.stringify(cards, null, 2).slice(0, 28000)}

EDITAL (trecho):
${(context.editalText || '').slice(0, 6000)}`
  }

  if (step === 'material') {
    return `${header}
MATERIAL COMPLETO:
${JSON.stringify(bundle.material || {}, null, 2).slice(0, 28000)}

EDITAL (trecho):
${(context.editalText || '').slice(0, 6000)}`
  }

  const questoesList = bundle.questoes?.questoes || bundle.questoes?.questions || []
  return `${header}
QUESTÕES (${questoesList.length} total):
${JSON.stringify(bundle.questoes || {}, null, 2).slice(0, 28000)}

EDITAL (trecho):
${(context.editalText || '').slice(0, 6000)}`
}

async function finalizeWithSnapshot(courseId, itemType, payload, final, chain, script, dedupeKey) {
  const corrections = final.corrections || []
  const { applied, patches } = await applyCorrectionsWithSnapshot(
    courseId,
    itemType,
    payload,
    corrections,
  )
  const diffSummary = buildDiffSummary(patches, corrections)

  const reviewId = await saveAdminReview({
    courseId,
    itemType,
    step: payload.step || TOPIC_STEP_MAP[itemType] || null,
    payload,
    dedupeKey,
    scriptIssues: script?.issues || [],
    verdict: final,
    professorsUsed: chain.professorsUsed,
    patches,
    diffSummary,
    appliedCount: applied,
  })

  await saveHistory({
    courseId,
    itemType,
    dedupeKey,
    payload,
    scriptIssues: script?.issues || [],
    verdict: final,
    professorsUsed: chain.professorsUsed,
    appliedCount: applied,
    reviewId,
    autoApplied: true,
  })

  return { summary: final.summary, applied, needsAdmin: true, reviewId, professorsUsed: chain.professorsUsed }
}

async function processTopicoStepItem(courseId, payload, itemType, updateJob, userId, jobId) {
  const step = payload.step || TOPIC_STEP_MAP[itemType] || 'flashcards'
  const bundle = await loadTopicBundle(
    courseId,
    payload.topicKey,
    payload.disciplina,
    payload.modulo,
  )
  const script = scriptCheckTopicStep(bundle, step)

  if (!script.needsReview && script.severity === 'low') {
    const dedupeKey = `${courseId}:${itemType}:${payload.topicKey}`
    await saveSkipHistory({
      courseId,
      itemType,
      payload,
      dedupeKey,
      reason: 'script_ok',
      summary: `Etapa ${step} passou na checagem estrutural — IA não necessária.`,
    })
    return {
      skipped: true,
      reason: 'script_ok',
      script,
      summary: `Etapa ${step} passou na checagem estrutural — IA não necessária.`,
    }
  }

  const context = await loadMentoradoAutomationContext(courseId)
  const contextBlock = buildTopicStepContext(step, bundle, { ...payload, courseId }, context, script)
  const chain = await runProfessorChain(contextBlock, updateJob, userId, jobId)
  const final = {
    ...chain.final,
    corrections: filterCorrectionsForStep(chain.final.corrections || [], step),
  }
  const dedupeKey = `${courseId}:${itemType}:${payload.topicKey}`

  return finalizeWithSnapshot(courseId, itemType, { ...payload, step }, final, chain, script, dedupeKey)
}

async function processTopicPipeline(courseId, payload, updateJob, userId, jobId) {
  // Digitação fica desativada no switch individual; no pipeline só revisamos conteúdo com IA.
  const steps = ['topico_flashcards', 'topico_material', 'topico_questoes']
  let applied = 0
  let professorsUsed = 0
  const summaries = []

  for (const stepType of steps) {
    await throwIfCancelled(userId, jobId)
    const stepOutcome = await processTopicoStepItem(
      courseId,
      payload,
      stepType,
      updateJob,
      userId,
      jobId,
    )
    if (stepOutcome?.skipped) {
      summaries.push(stepOutcome.summary || stepType)
      continue
    }
    applied += stepOutcome.applied || 0
    professorsUsed = Math.max(professorsUsed, stepOutcome.professorsUsed || 0)
    if (stepOutcome.summary) summaries.push(stepOutcome.summary)
  }

  if (applied === 0 && summaries.length) {
    return {
      skipped: true,
      reason: 'pipeline_ok',
      summary: summaries[0] || 'Pipeline de tópico OK',
      professorsUsed,
    }
  }

  return {
    summary: summaries.filter(Boolean).slice(-1)[0] || 'Pipeline de tópico revisado',
    applied,
    professorsUsed,
    needsAdmin: applied > 0,
  }
}

async function processDigitacaoItem(courseId, payload, updateJob, userId, jobId) {
  const bundle = await loadTopicBundle(
    courseId,
    payload.topicKey,
    payload.disciplina,
    payload.modulo,
  )
  const material = bundle.material
  if (!material) {
    const dedupeKey = `${courseId}:topico_digitacao:${payload.topicKey}`
    await saveSkipHistory({
      courseId,
      itemType: 'topico_digitacao',
      payload,
      dedupeKey,
      reason: 'no_material',
      summary: 'Material ausente — digitação ignorada.',
    })
    return { skipped: true, reason: 'no_material', summary: 'Material ausente — digitação ignorada.' }
  }

  await updateJob(userId, jobId, {
    progress: 40,
    message: 'Professor de digitação — corrigindo material (script)…',
  })

  const fixes = scanMaterialTypos(material)
  if (!fixes.length) {
    const dedupeKey = `${courseId}:topico_digitacao:${payload.topicKey}`
    await saveHistory({
      courseId,
      itemType: 'topico_digitacao',
      dedupeKey,
      payload,
      verdict: buildDigitacaoVerdict([]),
      professorsUsed: 0,
      appliedCount: 0,
      reviewId: null,
      autoApplied: false,
      digitacaoOnly: true,
    })
    return {
      skipped: true,
      reason: 'digitacao_ok',
      summary: 'Nenhum erro de digitação detectado no material.',
    }
  }

  const verdict = buildDigitacaoVerdict(fixes)
  const { applied, patches, diffSummary } = await applyDigitacaoFixes(courseId, payload.topicKey, fixes)
  const dedupeKey = `${courseId}:topico_digitacao:${payload.topicKey}`

  const reviewId = await saveAdminReview({
    courseId,
    itemType: 'topico_digitacao',
    step: 'digitacao',
    payload,
    dedupeKey,
    verdict,
    professorsUsed: 0,
    patches,
    diffSummary,
    appliedCount: applied,
    digitacaoOnly: true,
  })

  await saveHistory({
    courseId,
    itemType: 'topico_digitacao',
    dedupeKey,
    payload,
    verdict,
    professorsUsed: 0,
    appliedCount: applied,
    reviewId,
    autoApplied: true,
    digitacaoOnly: true,
  })

  return {
    summary: verdict.summary,
    applied,
    needsAdmin: true,
    reviewId,
    professorsUsed: 0,
    digitacaoOnly: true,
  }
}

async function resolveFlagFeedback(courseId, flagId, { applied = 0, summary = '' } = {}) {
  if (!flagId) return
  const db = getDb()
  const flagRef = db.doc(`courses/${courseId}/contentFeedback/${flagId}`)
  const flagSnap = await flagRef.get()
  const flagData = flagSnap.exists ? flagSnap.data() : {}

  await flagRef.set(
    {
      status: 'resolved',
      resolvedBy: 'professor_supervisor',
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      appliedCorrections: applied,
      resolveSummary: summary || null,
    },
    { merge: true },
  )

  const targetUserId = flagData.userId
  if (!targetUserId) {
    console.warn('[resolveFlagFeedback] flag sem userId:', flagId)
    return
  }

  const typeLabel =
    flagData.contentType === 'flashcard'
      ? 'flashcard'
      : flagData.contentType === 'questao'
        ? 'questão'
        : flagData.contentType || 'conteúdo'

  const message =
    applied > 0
      ? `Seu relatório sobre ${typeLabel} foi revisado e o conteúdo foi corrigido.`
      : `Seu relatório sobre ${typeLabel} foi revisado pelo professor. ${summary || 'O conteúdo foi analisado.'}`

  const courseIdSafe = courseId || null
  const { buildTopicContentLink } = require('./topicKeyUtils')
  const linkPath = buildTopicContentLink({
    courseId: courseIdSafe,
    topicKey: flagData.topicKey || null,
    contentType: flagData.contentType || null,
    contentId: flagData.contentId || null,
    disciplinaNome: flagData.disciplinaNome || '',
    topicoNome: flagData.topicoNome || '',
    moduloLabel: flagData.moduloLabel || '',
  })

  await db.collection(`users/${targetUserId}/notifications`).add({
    type: 'flag_corrected',
    tone: 'success',
    title: applied > 0 ? 'Sinalização corrigida' : 'Sinalização revisada',
    message,
    courseId: courseIdSafe,
    contentType: flagData.contentType || null,
    contentId: flagData.contentId || null,
    topicKey: flagData.topicKey || null,
    disciplinaNome: flagData.disciplinaNome || null,
    topicoNome: flagData.topicoNome || null,
    moduloLabel: flagData.moduloLabel || null,
    flagId,
    preview: flagData.preview || '',
    linkPath,
    appliedCorrections: applied,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}

async function loadFlaggedContentBlock(courseId, payload = {}) {
  const db = getDb()
  const { contentType, contentId, topicKey } = payload
  const { sanitizeTopicKeyForFirestore, sanitizeDisciplinaKey } = require('./topicKeyUtils')
  const {
    findFlaggedQuestao,
    normalizeFlashcardDocId,
    loadFlashcardBefore,
    listMaterialEditablePaths,
  } = require('./professorSupervisorPatches')

  if (contentType === 'flashcard') {
    const cardId = normalizeFlashcardDocId(contentId)
    const before = await loadFlashcardBefore(courseId, cardId, cardId)
    if (before) {
      return `FLASHCARD COMPLETO:\n${JSON.stringify(
        {
          id: before.__docId || cardId,
          frente: before.frente || before.pergunta,
          verso: before.verso || before.resposta,
        },
        null,
        2,
      )}`
    }
  }

  if (contentType === 'material' || contentType === 'materia' || contentType === 'incidencia') {
    let snap = null
    if (contentType === 'incidencia') {
      const key = sanitizeDisciplinaKey(topicKey || '')
      if (key) {
        snap = await db.doc(`courses/${courseId}/conteudosIncidencia/${key}`).get()
      }
    } else {
      const docId = sanitizeTopicKeyForFirestore(topicKey || '')
      if (docId) {
        snap = await db.doc(`courses/${courseId}/conteudosCompletos/${docId}`).get()
      }
    }
    if (snap?.exists) {
      const data = snap.data() || {}
      const paths = listMaterialEditablePaths(data)
      return `MATERIAL COMPLETO (corrija o PATH do bloco errado; "materia" é só título):
PATHS EDITÁVEIS:
${paths.join('\n')}

PREVIEW DO ALUNO: ${payload.preview || '—'}

DADOS:
${JSON.stringify(data, null, 2).slice(0, 26000)}`
    }
  }

  if (contentType === 'questao') {
    const found = await findFlaggedQuestao(courseId, payload)
    if (found) {
      return `QUESTÃO COMPLETA (pack ${found.packId}, índice ${found.idx}, numero=${found.questao?.numero ?? found.idx + 1}):
Use refId="${found.idx}" e field="aligned" com newText JSON contendo TODOS os campos alinhados:
{"correta":"A"|"B"|...,"gabaritoComentado":"explicação coerente com o gabarito","enunciado":"(só se precisar corrigir)","alternativas":{"A":"..."} (só se precisar)}

Nunca altere só o enunciado/gabarito sem atualizar a explicação quando o sentido da resposta muda.

${JSON.stringify(
        {
          enunciado: found.questao?.enunciado,
          alternativas: found.questao?.alternativas,
          correta: found.questao?.respostaCorreta || found.questao?.correta || found.questao?.gabarito,
          gabaritoComentado:
            found.questao?.gabaritoComentado ||
            found.questao?.explicacao ||
            found.questao?.comentario,
        },
        null,
        2,
      )}`
    }
  }

  return ''
}

async function releaseFlagStatus(courseId, flagId, status, extra = {}) {
  if (!flagId) return
  await getDb()
    .doc(`courses/${courseId}/contentFeedback/${flagId}`)
    .set(
      {
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...extra,
      },
      { merge: true },
    )
}

async function claimFlagInReview(courseId, flagId, jobId = '') {
  if (!flagId) return { ok: false, reason: 'no_flag' }
  const ref = getDb().doc(`courses/${courseId}/contentFeedback/${flagId}`)
  try {
    return await getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) return { ok: false, reason: 'missing' }
      const data = snap.data() || {}
      const status = data.status
      if (status === 'resolved') return { ok: false, reason: 'already_resolved' }

      if (status === 'in_review') {
        // Resume do mesmo job (API pause) — permite retomar
        if (jobId && data.inReviewJobId && data.inReviewJobId === jobId) {
          return { ok: true, data, resumed: true }
        }
        const at = data.inReviewAt?.toDate?.() || null
        const stale = !at || Date.now() - at.getTime() > 30 * 60 * 1000
        if (!stale) return { ok: false, reason: 'already_in_review' }
      } else if (status !== 'open' && status !== 'needs_admin') {
        return { ok: false, reason: `status_${status || 'unknown'}` }
      }

      tx.set(
        ref,
        {
          status: 'in_review',
          inReviewAt: admin.firestore.FieldValue.serverTimestamp(),
          inReviewBy: 'professor_supervisor',
          inReviewJobId: jobId || null,
        },
        { merge: true },
      )
      return { ok: true, data }
    })
  } catch (err) {
    console.warn('[claimFlagInReview]', err?.message || err)
    return { ok: false, reason: 'tx_failed' }
  }
}

function filterActionableCorrections(corrections = [], verdict = {}) {
  if (verdict.reportValid === false) return []
  if (verdict.needsAdminReview === true) return []
  const minConf = Number(MIN_CONFIDENCE_AUTO_APPLY) || 0.78
  return (corrections || []).filter((c) => {
    if (!c || c.newText == null) return false
    const conf = Number(c.confidence)
    if (Number.isFinite(conf) && conf < minConf) return false
    if (!String(c.newText).trim()) return false
    return true
  })
}

function resolveContentTarget(contentType, target) {
  if (target) return target
  if (contentType === 'flashcard') return 'flashcard'
  if (contentType === 'questao') return 'questao'
  if (
    contentType === 'material' ||
    contentType === 'materia' ||
    contentType === 'incidencia'
  ) {
    return 'material'
  }
  return target
}

async function processFlagItem(courseId, payload, updateJob, userId, jobId) {
  const claim = await claimFlagInReview(courseId, payload.flagId, jobId)
  if (!claim.ok) {
    return {
      skipped: true,
      reason: claim.reason || 'flag_not_claimable',
      summary: `Sinalização ignorada (${claim.reason || 'já em andamento/resolvida'}).`,
      applied: 0,
      flagResolved: claim.reason === 'already_resolved',
    }
  }

  const contentBlock = await loadFlaggedContentBlock(courseId, payload)
  const flashcardId =
    payload.contentType === 'flashcard'
      ? String(payload.contentId || '').replace(/^.*_fc_/, '')
      : ''

  if (!contentBlock) {
    await releaseFlagStatus(courseId, payload.flagId, 'needs_admin', {
      lastProfessorSummary: 'Conteúdo sinalizado não foi encontrado para correção automática.',
      lastProfessorApplied: 0,
      inReviewJobId: null,
    })
    return {
      summary: 'Conteúdo não carregado — sinalização enviada para revisão admin.',
      applied: 0,
      needsAdmin: true,
      flagResolved: false,
      professorsUsed: 0,
    }
  }

  const contextBlock = `TIPO: conteúdo sinalizado por aluno — revise com rigor e só corrija erro REAL
CURSO: ${courseId}
TIPO CONTEÚDO: ${payload.contentType}
CONTENT_ID: ${payload.contentId}
FLASHCARD_DOC_ID: ${flashcardId || '—'}
TÓPICO: ${payload.topicKey || '—'}
PREVIEW: ${payload.preview || ''}
RELATO DO ALUNO: ${payload.reportText || ''}

CONTEÚDO INTEGRAL:
${contentBlock}

INSTRUÇÕES OBRIGATÓRIAS:
- Primeiro verifique se o CONTEÚDO INTEGRAL está realmente errado conforme o relato.
- Se estiver CORRETO: corrections=[], issues=[], reportValid=false. NÃO invente erro. NÃO reescreva por estilo.
- Se estiver ERRADO: emita corrections com newText já corrigido.
- Se houver dúvida factual: needsAdminReview=true e corrections=[] (não invente patch).
- target exatamente: flashcard | material | questao
- flashcard: field = frente | verso | ambos; refId = "${flashcardId || payload.contentId}"
- questao (OBRIGATÓRIO alinhamento): field = "aligned" e newText = JSON:
  {"correta":"A-E","gabaritoComentado":"explicação alinhada ao gabarito","enunciado":"se precisar","alternativas":{}}
  • Se o gabarito ou alternativas mudarem, gabaritoComentado É OBRIGATÓRIO e deve justificar a resposta correta.
  • Nunca corrija só o enunciado deixando gabarito/explicação desalinhados.
  • refId = índice 0-based da questão no pack.
- material: field = path real (revisaoTurbo.N.conteudo…). "materia" = só título.
- newText deve ser diferente do texto atual`

  const chain = await runProfessorChain(contextBlock, updateJob, userId, jobId)
  const final = chain.final || {}
  let corrections = filterActionableCorrections(final.corrections || [], final)

  corrections = corrections.map((c) => ({
    ...c,
    refId: c.refId || flashcardId || payload.contentId || null,
    target: resolveContentTarget(payload.contentType, c.target),
  }))

  corrections = consolidateQuestaoCorrections(corrections)

  const incompleteQuestao = corrections.some((c) => c.incompleteAlignment)
  if (incompleteQuestao) {
    corrections = corrections.filter((c) => !c.incompleteAlignment)
  }

  const dedupeKey = `flag:${courseId}:${payload.flagId}`
  const { applied, patches } = await applyCorrectionsWithSnapshot(
    courseId,
    'flag',
    {
      ...payload,
      contentType:
        payload.contentType === 'incidencia' ? 'incidencia' : payload.contentType,
    },
    corrections,
  )
  const diffSummary = buildDiffSummary(patches, corrections)

  await saveHistory({
    courseId,
    itemType: 'flag',
    dedupeKey,
    payload,
    verdict: { ...final, corrections },
    professorsUsed: chain.professorsUsed,
    appliedCount: applied,
    reviewId: null,
    autoApplied: applied > 0,
    skipModeration: true,
    diffSummary,
  })

  const studentWrong = final.reportValid === false
  const contentOk =
    applied === 0 &&
    !incompleteQuestao &&
    (studentWrong || (corrections.length === 0 && !final.needsAdminReview))
  const patchFailed =
    applied === 0 &&
    !contentOk &&
    (corrections.length > 0 || final.needsAdminReview === true || incompleteQuestao)

  if (applied > 0 && !incompleteQuestao) {
    const summary = final.summary || 'Conteúdo corrigido (questão/gabarito/explicação alinhados).'
    await resolveFlagFeedback(courseId, payload.flagId, { applied, summary })
    return {
      summary,
      applied,
      needsAdmin: false,
      professorsUsed: chain.professorsUsed,
      flagResolved: true,
    }
  }

  // Se aplicou algo mas ficou alinhamento incompleto — ainda precisa admin (caso raro)
  if (applied > 0 && incompleteQuestao) {
    const summary =
      final.summary ||
      'Correção parcial aplicada, mas gabarito/explicação ficaram incompletos — revisar admin.'
    await releaseFlagStatus(courseId, payload.flagId, 'needs_admin', {
      lastProfessorSummary: summary,
      lastProfessorApplied: applied,
      inReviewJobId: null,
      needsAdminReason: 'incomplete_questao_alignment',
    })
    return {
      summary,
      applied,
      needsAdmin: true,
      professorsUsed: chain.professorsUsed,
      flagResolved: false,
    }
  }

  if (contentOk) {
    const summary =
      final.summary || 'Conteúdo analisado: sem erro a corrigir (sinalização encerrada).'
    await resolveFlagFeedback(courseId, payload.flagId, { applied: 0, summary })
    return {
      summary,
      applied: 0,
      needsAdmin: false,
      professorsUsed: chain.professorsUsed,
      flagResolved: true,
    }
  }

  const summary =
    incompleteQuestao
      ? final.summary ||
        'Gabarito/enunciado sem explicação alinhada — sinalização enviada para admin.'
      : final.summary ||
        (patchFailed
          ? 'Professor não conseguiu aplicar a correção automaticamente — aguardando admin.'
          : 'Sinalização pendente de revisão admin.')
  await releaseFlagStatus(courseId, payload.flagId, 'needs_admin', {
    lastProfessorSummary: summary,
    lastProfessorApplied: 0,
    inReviewJobId: null,
    needsAdminReason: incompleteQuestao ? 'incomplete_questao_alignment' : 'patch_failed',
  })

  return {
    summary,
    applied: 0,
    needsAdmin: true,
    professorsUsed: chain.professorsUsed,
    flagResolved: false,
  }
}

async function processVesperaItem(courseId, updateJob, userId, jobId) {
  const snap = await getDb().doc(`courses/${courseId}/vesperaDeProva/material`).get()
  if (!snap.exists) {
    const dedupeKey = `${courseId}:vespera:material`
    await saveSkipHistory({
      courseId,
      itemType: 'vespera',
      payload: { scope: 'material' },
      dedupeKey,
      reason: 'no_vespera',
      summary: 'Véspera de prova ausente.',
    })
    return { skipped: true, reason: 'no_vespera' }
  }

  const materialDoc = snap.data()
  const script = scriptCheckVespera(materialDoc)
  if (!script.needsReview) {
    const dedupeKey = `${courseId}:vespera:material`
    await saveSkipHistory({
      courseId,
      itemType: 'vespera',
      payload: { scope: 'material' },
      dedupeKey,
      reason: 'script_ok',
      summary: 'Véspera OK na checagem estrutural.',
    })
    return { skipped: true, reason: 'script_ok', summary: 'Véspera OK na checagem estrutural.' }
  }

  const contextBlock = `TIPO: véspera de prova — resumo
CURSO: ${courseId}
PROBLEMAS SCRIPT: ${JSON.stringify(script.issues)}
MATERIAL: ${JSON.stringify(materialDoc, null, 2).slice(0, 14000)}`

  const chain = await runProfessorChain(contextBlock, updateJob, userId, jobId)
  const final = chain.final
  const dedupeKey = `${courseId}:vespera:material`
  const { applied, patches } = await applyCorrectionsWithSnapshot(
    courseId,
    'vespera',
    {},
    final.corrections || [],
  )
  const diffSummary = buildDiffSummary(patches, final.corrections || [])
  const reviewId = await saveAdminReview({
    courseId,
    itemType: 'vespera',
    payload: { scope: 'material' },
    dedupeKey,
    scriptIssues: script.issues,
    verdict: final,
    professorsUsed: chain.professorsUsed,
    patches,
    diffSummary,
    appliedCount: applied,
  })

  await saveHistory({
    courseId,
    itemType: 'vespera',
    dedupeKey,
    verdict: final,
    professorsUsed: chain.professorsUsed,
    appliedCount: applied,
    reviewId,
    autoApplied: true,
  })

  return { summary: final.summary, applied, needsAdmin: true, reviewId, professorsUsed: chain.professorsUsed }
}

async function processRedacaoItem(courseId, payload, updateJob, userId, jobId) {
  const db = getDb()
  const snap = await db.doc(`courses/${courseId}/config/redacao`).get()
  const config = snap.exists ? snap.data() : {}
  const courseSnap = await db.doc(`courses/${courseId}`).get()
  const course = courseSnap.exists ? courseSnap.data() || {} : {}
  // Fonte de verdade: campos do curso no Admin (banca examinadora + cargo/competition)
  const banca = String(course.banca || '').trim() || 'banca do concurso'
  const cargo = String(course.competition || '').trim()
  const concurso = cargo || String(course.name || courseId).trim()
  const temaAtual = String(config.tema || '').trim()

  await updateJob(userId, jobId, {
    progress: 20,
    message: `Gerando tema de redação (${banca} / ${concurso})…`,
  })

  // Só tema (+ guia opcional). NÃO inventar flashcards, material de edital nem questões.
  const prompt = `Você é professor de redação para concursos públicos.

BANCA EXAMINADORA (use EXATAMENTE esta — vem do cadastro do curso; NÃO troque por órgão/secretaria): ${banca}
CARGO (calibre a dificuldade e o enfoque do tema por este cargo): ${cargo || concurso}
CONCURSO: ${concurso}
TEMA ATUAL (não repetir se possível): ${temaAtual || '(nenhum)'}

TAREFA ÚNICA:
1) Proponha UM tema de redação dissertativa-argumentativa com ALTA probabilidade de cair nesta banca para este cargo (atual, específico). A dificuldade deve refletir o nível típico do cargo informado.
2) Opcionalmente, um guia curto (guiaNota1000) explicando como escrever redação nota máxima segundo os critérios típicos da banca "${banca}" (estrutura, coerência, repertório, o que evitar).

PROIBIDO:
- Inventar flashcards
- Inventar material de edital / conteúdo de disciplinas
- Inventar questões objetivas
- Qualquer correção fora de tema/guia de redação
- Substituir a banca "${banca}" por nome de órgão, secretaria ou instituição organizadora

Retorne APENAS JSON válido:
{
  "tema": "texto do tema",
  "guiaNota1000": "texto curto em markdown com dicas da banca (pode ser string vazia)",
  "summary": "resumo em 1 frase"
}`

  const parsed = await generateAiJsonWithJobHeartbeat(
    userId,
    jobId,
    prompt,
    {
      useRAG: true,
      maxParseAttempts: 3,
      generationConfig: { maxOutputTokens: 4096, temperature: 0.55 },
    },
    `Gerando tema de redação (${banca} / ${concurso})…`,
  )

  const tema = String(parsed?.tema || '').trim()
  if (!tema) {
    throw new Error('IA não retornou tema de redação válido.')
  }

  const guiaNota1000 = String(parsed?.guiaNota1000 || '').trim()
  const ts = admin.firestore.FieldValue.serverTimestamp()
  await db.doc(`courses/${courseId}/config/redacao`).set(
    {
      tema,
      ...(guiaNota1000 ? { guiaNota1000 } : {}),
      status: 'disponivel',
      supervisorReviewed: true,
      updatedAt: ts,
      rotatedAt: ts,
      lastRotationReason: payload.reason || 'weekly',
      bancaSnapshot: banca,
      concursoSnapshot: concurso,
      cargoSnapshot: cargo || concurso,
    },
    { merge: true },
  )

  await updateJob(userId, jobId, {
    progress: 90,
    message: `Tema publicado: ${tema.slice(0, 80)}…`,
  })

  const dedupeKey = `${courseId}:redacao:${payload.scope || payload.targetDate || 'rotate'}`
  await saveHistory({
    courseId,
    itemType: 'redacao',
    dedupeKey,
    payload,
    verdict: { summary: parsed?.summary || 'Tema semanal gerado', tema, guiaNota1000: Boolean(guiaNota1000) },
    professorsUsed: 1,
    appliedCount: 1,
    reviewId: null,
    autoApplied: true,
    skipModeration: true,
  })

  return {
    summary: parsed?.summary || `Tema: ${tema}`,
    applied: 1,
    needsAdmin: false,
    reviewId: null,
    professorsUsed: 1,
    themePublished: true,
    tema,
  }
}

async function processProfessorSupervisor(userId, jobId, courseId, serverPayload, updateJob) {
  const { queueItemId, itemType, payload = {} } = serverPayload || {}
  const label =
    payload.topicoNome ||
    payload.topicKey ||
    (itemType === 'vespera' ? 'Véspera de prova' : itemType === 'redacao' ? 'Redação' : itemType)

  const syncJob = async (uid, jid, patch) => {
    await updateJob(uid, jid, patch)
    await updateSupervisorActivity({
      phase: 'running',
      jobId: jid,
      itemType,
      courseId,
      label,
      message: patch.message || '',
      progress: patch.progress ?? null,
      professorStep: patch.message?.includes('digitação')
        ? 'digitacao'
        : patch.message?.includes('Professor 1')
        ? 'professor_1'
        : patch.message?.includes('Professor 2')
          ? 'professor_2'
          : patch.message?.includes('Professor 3')
            ? 'professor_3'
            : 'processando',
    })
  }

  await throwIfCancelled(userId, jobId)
  await touchActiveJob(userId, jobId, { jobType: 'professor_supervisor', courseId, status: 'running' })

  await updateSupervisorActivity({
    phase: 'running',
    jobId,
    itemType,
    courseId,
    label,
    professorStep: 'iniciando',
    message: `Professor fiscalizador — ${itemType}…`,
    progress: 10,
  })

  await syncJob(userId, jobId, {
    status: 'running',
    progress: 10,
    message: `Professor fiscalizador — ${label}…`,
  })

  let outcome

  try {
    switch (itemType) {
      case 'flag':
        outcome = await processFlagItem(courseId, payload, syncJob, userId, jobId)
        break
      case 'topico_digitacao':
      case 'topico_pipeline':
      case 'topico':
      case 'topico_flashcards':
      case 'topico_material':
      case 'topico_questoes':
      case 'vespera':
      case 'redacao':
        outcome = {
          skipped: true,
          reason: 'moderation_only',
          summary:
            'Professor IA atua somente na aba Moderação. Item ignorado (geração/redação/véspera têm jobs próprios).',
        }
        break
      default:
        throw new Error(`Tipo de fiscalização não suportado: ${itemType}`)
    }

    if (queueItemId) {
      await finishQueueItem(queueItemId, outcome.skipped ? 'skipped' : 'done')
    }

    await clearActiveJob(jobId)

    if (!outcome.skipped && !outcome.cancelled) {
      await incrementSessionCounter().catch(() => {})
    }

    const msg = outcome.skipped
      ? outcome.digitacaoOnly || outcome.reason === 'digitacao_ok'
        ? outcome.summary || 'Digitação OK'
        : `Checagem OK — ${outcome.reason || 'sem IA'}`
      : itemType === 'flag'
        ? outcome.applied > 0
          ? `Correção aplicada (${outcome.applied} alteração(ões))`
          : outcome.needsAdmin
            ? `Sinalização enviada para revisão admin (${outcome.summary || 'sem patch automático'})`
            : outcome.summary || 'Sinalização revisada sem alteração'
        : outcome.digitacaoOnly
          ? `Digitação corrigida — aguardando moderação (${outcome.applied || 0} campo(s))`
          : `Correções aplicadas — aguardando moderação (${outcome.applied || 0} alteração(ões), ${outcome.professorsUsed} professor(es))`

    await syncJob(userId, jobId, {
      status: 'done',
      progress: 100,
      message: msg,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    await scheduleNextRunForItem(itemType)

    // Nuvem: inicia o próximo job agora (não espera só o cron)
    try {
      const kick = await kickNextSupervisorItem()
      if (kick?.started) {
        console.log('[professorSupervisor] próximo item iniciado:', kick.itemType || kick.jobId)
      }
    } catch (kickErr) {
      console.warn('[professorSupervisor] kick next falhou:', kickErr?.message || kickErr)
    }

    return outcome
  } catch (err) {
    const flagId = serverPayload?.payload?.flagId

    if (isJobCancelledError(err) || (await isJobCancelled(userId, jobId))) {
      if (queueItemId) await finishQueueItem(queueItemId, 'cancelled')
      if (flagId) {
        await releaseFlagStatus(courseId, flagId, 'open', {
          lastProfessorSummary: 'Job cancelado — sinalização reaberta.',
          inReviewJobId: null,
        })
      }
      await clearActiveJob(jobId)
      await updateSupervisorActivity({ phase: 'idle', message: 'Cancelado pelo admin' })
      return { cancelled: true }
    }

    // Pause por API/erro: NÃO mata a fila; marca paused e mantém flag com jobId para resume
    if (queueItemId) {
      await setQueueItemStatus(queueItemId, 'paused', {
        pauseReason: isApiQuotaError(err) ? 'api' : 'error',
        pauseMessage: err.message || String(err),
      })
    }
    await clearActiveJob(jobId)

    if (isApiQuotaError(err)) {
      await updateSupervisorActivity({
        phase: 'waiting_api',
        message: 'API expirada — aguardando para retomar…',
      })
      await pauseJobForResume({
        userId,
        jobId,
        courseId,
        jobType: 'professor_supervisor',
        serverPayload,
        updateJob: syncJob,
        status: 'waiting_api',
        waitReason: 'api',
        message: 'API expirada — fiscalizador aguardando…',
      })
      return { paused: true }
    }

    await updateSupervisorActivity({
      phase: 'waiting_api',
      message: `Erro temporário — tentando de novo… (${err.message || 'erro'})`,
    })
    await pauseJobForResume({
      userId,
      jobId,
      courseId,
      jobType: 'professor_supervisor',
      serverPayload,
      updateJob: syncJob,
      status: 'waiting_retry',
      waitReason: 'error',
      message: `Erro temporário — tentando de novo… (${err.message || 'erro'})`,
    })
    return { paused: true }
  }
}

module.exports = {
  processProfessorSupervisor,
  processRedacaoItem,
}
