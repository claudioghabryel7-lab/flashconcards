const admin = require('firebase-admin')
const { generateAiJson } = require('./geminiServer')
const { loadMentoradoAutomationContext } = require('./guiaMentoradoEdital')
const {
  PROFESSOR_ROLES,
  REVIEW_JSON_SCHEMA,
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
} = require('./professorSupervisorPatches')
const { finishQueueItem, updateSupervisorActivity, scheduleNextRunForItem, kickNextSupervisorItem } = require('./professorSupervisorQueue')
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

async function runProfessor(role, contextBlock, priorReview, shouldAbort) {
  const prompt = buildProfessorPrompt(role, contextBlock, priorReview)
  return runWithHeartbeat(
    () =>
      generateAiJson(prompt, {
        useRAG: false,
        useGoogleSearch: role === 1,
        generationConfig: { maxOutputTokens: 12000, temperature: 0.25 },
      }),
    () => {},
    20000,
    shouldAbort,
  )
}

async function runProfessorChain(contextBlock, updateJob, userId, jobId) {
  const shouldAbort = () => isJobCancelled(userId, jobId)

  await updateJob(userId, jobId, { progress: 25, message: 'Professor 1 — fiscalizando…' })
  const p1 = await runProfessor(1, contextBlock, null, shouldAbort)

  const p1Actionable =
    (p1.issues?.length || 0) > 0 || (p1.corrections?.length || 0) > 0 || p1.needsAdminReview

  if (!p1Actionable && (p1.confidence || 0) >= 0.85) {
    return { final: p1, professorsUsed: 1, skippedHigher: true }
  }

  await updateJob(userId, jobId, { progress: 50, message: 'Professor 2 — revisando correção…' })
  const p2 = await runProfessor(2, contextBlock, p1, shouldAbort)

  const p2Changed =
    JSON.stringify(p2.corrections || []) !== JSON.stringify(p1.corrections || []) ||
    p2.needsAdminReview

  if (!p2Changed && (p2.confidence || 0) >= 0.8) {
    return { final: p2, professorsUsed: 2, skippedHigher: true }
  }

  await updateJob(userId, jobId, { progress: 75, message: 'Professor 3 — veredito final…' })
  const p3 = await runProfessor(3, contextBlock, p2, shouldAbort)
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
  const topicKey = flagData.topicKey || null
  const contentType = flagData.contentType || null
  let linkPath = '/edital-verticalizado'
  try {
    if (contentType === 'flashcard' && topicKey) {
      const decoded = decodeURIComponent(topicKey)
      const parts = decoded.split(' :: ')
      const materia = parts[0] || ''
      const modulo = parts.slice(1).join(' :: ') || ''
      const params = new URLSearchParams()
      if (courseIdSafe) params.set('course', courseIdSafe)
      if (materia) params.set('materia', materia)
      if (modulo) params.set('modulo', modulo)
      if (flagData.contentId) params.set('card', String(flagData.contentId))
      linkPath = `/flashcards/estudar?${params.toString()}`
    } else if ((contentType === 'material' || contentType === 'materia') && courseIdSafe && topicKey) {
      linkPath = `/conteudo-completo/topic/${courseIdSafe}/${encodeURIComponent(topicKey)}`
    } else if (contentType === 'questao' && courseIdSafe && topicKey) {
      linkPath = `/questoes-topic/${courseIdSafe}/${encodeURIComponent(topicKey)}`
    } else if (contentType === 'flashcard') {
      linkPath = courseIdSafe ? `/flashcards?course=${courseIdSafe}` : '/flashcards'
    } else if (contentType === 'questao') {
      linkPath = '/resolver-questoes'
    } else if (contentType === 'material' || contentType === 'materia') {
      linkPath = '/resolver-material'
    }
  } catch (_) {
    /* keep default */
  }

  await db.collection(`users/${targetUserId}/notifications`).add({
    type: 'flag_corrected',
    tone: 'success',
    title: applied > 0 ? 'Sinalização corrigida' : 'Sinalização revisada',
    message,
    courseId: courseIdSafe,
    contentType,
    contentId: flagData.contentId || null,
    topicKey,
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
  const { sanitizeTopicKeyForFirestore } = require('./topicKeyUtils')

  if (contentType === 'flashcard') {
    const cardId = String(contentId || '').replace(/^[^_]+_fc_/, '')
    const snap = await db.doc(`courses/${courseId}/flashcards/${cardId}`).get()
    if (snap.exists) {
      const c = snap.data()
      return `FLASHCARD COMPLETO:\n${JSON.stringify(
        {
          id: snap.id,
          frente: c.frente || c.pergunta,
          verso: c.verso || c.resposta,
        },
        null,
        2,
      )}`
    }
  }

  if (contentType === 'material' || contentType === 'materia') {
    const docId = sanitizeTopicKeyForFirestore(topicKey || contentId)
    const snap = await db.doc(`courses/${courseId}/conteudosCompletos/${docId}`).get()
    if (snap.exists) {
      return `MATERIAL COMPLETO:\n${JSON.stringify(snap.data(), null, 2).slice(0, 28000)}`
    }
  }

  if (contentType === 'questao') {
    const packsSnap = await db.collection(`courses/${courseId}/questoesTopico`).get()
    for (const packDoc of packsSnap.docs) {
      const pack = packDoc.data()
      const questoes = pack.questoes || []
      const idx = questoes.findIndex((q, i) => {
        const id = `${packDoc.id}_q${i}`
        return contentId?.includes(id) || contentId === id
      })
      if (idx >= 0) {
        return `QUESTÃO COMPLETA (pack ${packDoc.id}, índice ${idx}):\n${JSON.stringify(questoes[idx], null, 2)}`
      }
    }
  }

  return ''
}

async function processFlagItem(courseId, payload, updateJob, userId, jobId) {
  const contentBlock = await loadFlaggedContentBlock(courseId, payload)
  const flashcardId =
    payload.contentType === 'flashcard' ? String(payload.contentId || '').replace(/^.*_fc_/, '') : ''
  const contextBlock = `TIPO: conteúdo sinalizado por aluno — corrija APENAS o trecho errado apontado no relato
CURSO: ${courseId}
TIPO CONTEÚDO: ${payload.contentType}
CONTENT_ID: ${payload.contentId}
FLASHCARD_DOC_ID: ${flashcardId || '—'}
TÓPICO: ${payload.topicKey || '—'}
PREVIEW: ${payload.preview || ''}
RELATO DO ALUNO: ${payload.reportText || ''}

${contentBlock ? `CONTEÚDO INTEGRAL:\n${contentBlock}` : 'ATENÇÃO: não foi possível carregar o conteúdo — use o preview e o relato.'}

INSTRUÇÕES OBRIGATÓRIAS:
- Corrija somente o que está errado conforme o relato — não reescreva o material inteiro
- Em corrections use target exatamente: flashcard | material | questao
- Para flashcard: refId = "${flashcardId || payload.contentId}", field = frente|verso
- Para questao: refId = índice numérico ou contentId "${payload.contentId}", field = enunciado|comentario|gabarito|alternativa_*
- Para material: target material, field do campo a corrigir, newText com o texto corrigido
- Sempre inclua pelo menos 1 correction se o relato apontar erro concreto`

  const chain = await runProfessorChain(contextBlock, updateJob, userId, jobId)
  const final = chain.final
  let corrections = final.corrections || []

  // Se a IA não trouxe refId, força o contentId da flag
  corrections = corrections.map((c) => ({
    ...c,
    refId: c.refId || flashcardId || payload.contentId || null,
    target:
      c.target ||
      (payload.contentType === 'flashcard'
        ? 'flashcard'
        : payload.contentType === 'questao'
          ? 'questao'
          : payload.contentType === 'material' || payload.contentType === 'materia'
            ? 'material'
            : c.target),
  }))

  const dedupeKey = `${courseId}:flag:${payload.flagId}`
  const { applied, patches } = await applyCorrectionsWithSnapshot(
    courseId,
    'flag',
    payload,
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
    autoApplied: true,
    skipModeration: true,
    diffSummary,
  })

  // Notifica o aluno mesmo se applied=0 (revisão feita); marca flag resolvida
  await resolveFlagFeedback(courseId, payload.flagId, {
    applied,
    summary: final.summary || '',
  })

  return {
    summary: final.summary,
    applied,
    needsAdmin: false,
    reviewId: null,
    professorsUsed: chain.professorsUsed,
    flagResolved: true,
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
  const snap = await getDb().doc(`courses/${courseId}/config/redacao`).get()
  const config = snap.exists ? snap.data() : {}
  const script = scriptCheckRedacao(config)

  let contextBlock = `TIPO: redação semanal
CURSO: ${courseId}
TEMA ATUAL: ${config.tema || ''}
STATUS: ${config.status || 'indisponivel'}
PROBLEMAS SCRIPT: ${JSON.stringify(script.issues)}`

  if (payload.rotateTheme) {
    contextBlock += `\nTAREFA OBRIGATÓRIA: Proponha um NOVO tema de redação para concurso (corrections target redacao, field tema). O tema deve ser diferente do atual.`
  }

  const chain = await runProfessorChain(contextBlock, updateJob, userId, jobId)
  const final = chain.final
  const dedupeKey = `${courseId}:redacao:${payload.scope || payload.targetDate || 'rotate'}`
  const { applied, patches } = await applyCorrectionsWithSnapshot(
    courseId,
    'redacao',
    payload,
    final.corrections || [],
  )

  const ts = admin.firestore.FieldValue.serverTimestamp()
  if (payload.rotateTheme && applied === 0 && final.suggestedTema) {
    await getDb().doc(`courses/${courseId}/config/redacao`).set(
      {
        tema: final.suggestedTema,
        status: 'disponivel',
        supervisorReviewed: true,
        updatedAt: ts,
        rotatedAt: ts,
      },
      { merge: true },
    )
  } else if (payload.rotateTheme) {
    await getDb().doc(`courses/${courseId}/config/redacao`).set(
      { status: 'disponivel', supervisorReviewed: true, updatedAt: ts, rotatedAt: ts },
      { merge: true },
    )
  }

  await saveHistory({
    courseId,
    itemType: 'redacao',
    dedupeKey,
    payload,
    verdict: final,
    professorsUsed: chain.professorsUsed,
    appliedCount: applied,
    reviewId: null,
    autoApplied: true,
    skipModeration: true,
  })

  return {
    summary: final.summary,
    applied,
    needsAdmin: false,
    reviewId: null,
    professorsUsed: chain.professorsUsed,
    themePublished: Boolean(payload.rotateTheme),
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
      case 'topico_digitacao':
        outcome = { skipped: true, reason: 'digitacao_disabled', summary: 'Digitação desativada — apenas sinalizações.' }
        break
      case 'topico_pipeline':
        outcome = await processTopicPipeline(courseId, payload, syncJob, userId, jobId)
        break
      case 'topico':
      case 'topico_flashcards':
      case 'topico_material':
      case 'topico_questoes':
        outcome = await processTopicoStepItem(courseId, payload, itemType, syncJob, userId, jobId)
        break
      case 'flag':
        outcome = await processFlagItem(courseId, payload, syncJob, userId, jobId)
        break
      case 'vespera':
        outcome = await processVesperaItem(courseId, syncJob, userId, jobId)
        break
      case 'redacao':
        outcome = await processRedacaoItem(courseId, payload, syncJob, userId, jobId)
        break
      default:
        throw new Error(`Tipo de fiscalização não suportado: ${itemType}`)
    }

    if (queueItemId) {
      await finishQueueItem(queueItemId, outcome.skipped ? 'skipped' : 'done')
    }

    await clearActiveJob(jobId)

    const msg = outcome.skipped
      ? outcome.digitacaoOnly || outcome.reason === 'digitacao_ok'
        ? outcome.summary || 'Digitação OK'
        : `Checagem OK — ${outcome.reason || 'sem IA'}`
      : itemType === 'flag'
        ? `Correção aplicada automaticamente (${outcome.applied || 0} alteração(ões))`
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

    // Nuvem: inicia o próximo job agora (não espera o cron de 5 min)
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
    if (queueItemId) {
      await finishQueueItem(queueItemId, isJobCancelledError(err) ? 'cancelled' : 'error')
    }
    await clearActiveJob(jobId)

    if (isJobCancelledError(err) || (await isJobCancelled(userId, jobId))) {
      await updateSupervisorActivity({ phase: 'idle', message: 'Cancelado pelo admin' })
      return { cancelled: true }
    }

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
}
