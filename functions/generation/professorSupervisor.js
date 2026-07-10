const admin = require('firebase-admin')
const { generateAiJson } = require('./geminiServer')
const { sanitizeTopicKeyForFirestore } = require('./topicKeyUtils')
const { loadMentoradoAutomationContext } = require('./guiaMentoradoEdital')
const {
  PROFESSOR_ROLES,
  REVIEW_JSON_SCHEMA,
  MIN_CONFIDENCE_AUTO_APPLY,
} = require('./professorSupervisorShared')
const {
  scriptCheckTopicContent,
  loadTopicBundle,
  scriptCheckVespera,
  scriptCheckRedacao,
} = require('./professorSupervisorScripts')
const { finishQueueItem } = require('./professorSupervisorQueue')
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

async function saveAdminReview(entry) {
  const ref = await getDb().collection('professorSupervisorReviews').add({
    ...entry,
    status: 'pending_admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  return ref.id
}

async function applyCorrections(courseId, itemType, payload, corrections = []) {
  const db = getDb()
  const ts = admin.firestore.FieldValue.serverTimestamp()
  let applied = 0

  for (const fix of corrections) {
    if ((fix.confidence || 0) < MIN_CONFIDENCE_AUTO_APPLY) continue

    if (fix.target === 'flashcard' && fix.refId) {
      await db.doc(`courses/${courseId}/flashcards/${fix.refId}`).set(
        { verso: fix.newText, resposta: fix.newText, updatedAt: ts, supervisorReviewed: true },
        { merge: true },
      )
      applied += 1
    }

    if (fix.target === 'material' && itemType === 'topico') {
      const key = sanitizeTopicKeyForFirestore(payload.topicKey)
      const field = fix.field || 'resumo'
      await db.doc(`courses/${courseId}/conteudosCompletos/${key}`).set(
        { [field]: fix.newText, updatedAt: ts, supervisorReviewed: true },
        { merge: true },
      )
      applied += 1
    }

    if (fix.target === 'redacao') {
      await db.doc(`courses/${courseId}/config/redacao`).set(
        { tema: fix.newText, status: 'disponivel', updatedAt: ts, supervisorReviewed: true },
        { merge: true },
      )
      applied += 1
    }

    if (fix.target === 'vespera' && fix.refId != null) {
      const snap = await db.doc(`courses/${courseId}/vesperaDeProva/material`).get()
      if (!snap.exists) continue
      const material = [...(snap.data().material || [])]
      const idx = Number(fix.refId)
      if (material[idx] && fix.field === 'resumo') {
        const resumos = [...(material[idx].revisaoTurbo?.resumos || [])]
        if (resumos.length) resumos[0] = fix.newText
        material[idx] = {
          ...material[idx],
          revisaoTurbo: { ...material[idx].revisaoTurbo, resumos },
        }
        await snap.ref.set({ material, updatedAt: ts, supervisorReviewed: true }, { merge: true })
        applied += 1
      }
    }
  }

  return applied
}

async function processTopicoItem(courseId, payload, updateJob, userId, jobId) {
  const bundle = await loadTopicBundle(
    courseId,
    payload.topicKey,
    payload.disciplina,
    payload.modulo,
  )
  const script = scriptCheckTopicContent(bundle)

  if (!script.needsReview && script.severity === 'low') {
    return {
      skipped: true,
      reason: 'script_ok',
      script,
      summary: 'Tópico passou na checagem estrutural — IA não necessária.',
    }
  }

  const context = await loadMentoradoAutomationContext(courseId)
  const sampleCards = bundle.flashcards.slice(0, 8).map((c) => ({
    id: c.id,
    frente: c.frente,
    verso: (c.verso || '').slice(0, 500),
  }))

  const contextBlock = `TIPO: tópico do dia
CURSO: ${context.courseName || courseId}
DISCIPLINA: ${payload.disciplina}
TÓPICO: ${payload.topicoNome}
DATA: ${payload.targetDate || ''}

PROBLEMAS DO SCRIPT:
${JSON.stringify(script.issues, null, 2)}

AMOSTRA FLASHCARDS (${bundle.flashcards.length} total):
${JSON.stringify(sampleCards, null, 2)}

MATERIAL (trecho):
${JSON.stringify(bundle.material || {}, null, 2).slice(0, 10000)}

QUESTÕES (trecho):
${JSON.stringify(bundle.questoes || {}, null, 2).slice(0, 8000)}

EDITAL (trecho):
${(context.editalText || '').slice(0, 6000)}`

  const chain = await runProfessorChain(contextBlock, updateJob, userId, jobId)
  const final = chain.final
  const dedupeKey = `${courseId}:topico:${payload.topicKey}`

  const needsAdmin =
    final.needsAdminReview ||
    (final.confidence || 0) < MIN_CONFIDENCE_AUTO_APPLY ||
    (final.issues?.length > 0 && !(final.corrections?.length > 0))

  let reviewId = null
  let applied = 0

  if (needsAdmin) {
    reviewId = await saveAdminReview({
      courseId,
      itemType: 'topico',
      payload,
      dedupeKey,
      scriptIssues: script.issues,
      verdict: final,
      professorsUsed: chain.professorsUsed,
    })
  } else {
    applied = await applyCorrections(courseId, 'topico', payload, final.corrections || [])
  }

  await saveHistory({
    courseId,
    itemType: 'topico',
    dedupeKey,
    payload,
    scriptIssues: script.issues,
    verdict: final,
    professorsUsed: chain.professorsUsed,
    appliedCount: applied,
    reviewId,
    autoApplied: !needsAdmin,
  })

  return { summary: final.summary, applied, needsAdmin, reviewId, professorsUsed: chain.professorsUsed }
}

async function processFlagItem(courseId, payload, updateJob, userId, jobId) {
  const contextBlock = `TIPO: conteúdo sinalizado por aluno
CURSO: ${courseId}
TIPO CONTEÚDO: ${payload.contentType}
ID: ${payload.contentId}
TÓPICO: ${payload.topicKey || '—'}
PREVIEW: ${payload.preview || ''}
RELATO DO ALUNO: ${payload.reportText || ''}`

  const chain = await runProfessorChain(contextBlock, updateJob, userId, jobId)
  const final = chain.final
  const reviewId = await saveAdminReview({
    courseId,
    itemType: 'flag',
    payload,
    dedupeKey: `${courseId}:flag:${payload.flagId}`,
    verdict: final,
    professorsUsed: chain.professorsUsed,
  })

  await saveHistory({
    courseId,
    itemType: 'flag',
    dedupeKey: `${courseId}:flag:${payload.flagId}`,
    payload,
    verdict: final,
    professorsUsed: chain.professorsUsed,
    reviewId,
    autoApplied: false,
  })

  return { summary: final.summary, needsAdmin: true, reviewId, professorsUsed: chain.professorsUsed }
}

async function processVesperaItem(courseId, updateJob, userId, jobId) {
  const snap = await getDb().doc(`courses/${courseId}/vesperaDeProva/material`).get()
  if (!snap.exists) return { skipped: true, reason: 'no_vespera' }

  const materialDoc = snap.data()
  const script = scriptCheckVespera(materialDoc)
  if (!script.needsReview) {
    return { skipped: true, reason: 'script_ok', summary: 'Véspera OK na checagem estrutural.' }
  }

  const contextBlock = `TIPO: véspera de prova — resumo
CURSO: ${courseId}
PROBLEMAS SCRIPT: ${JSON.stringify(script.issues)}
MATERIAL: ${JSON.stringify(materialDoc, null, 2).slice(0, 14000)}`

  const chain = await runProfessorChain(contextBlock, updateJob, userId, jobId)
  const final = chain.final
  const needsAdmin = final.needsAdminReview || (final.confidence || 0) < MIN_CONFIDENCE_AUTO_APPLY
  let applied = 0
  let reviewId = null

  if (needsAdmin) {
    reviewId = await saveAdminReview({
      courseId,
      itemType: 'vespera',
      payload: { scope: 'material' },
      dedupeKey: `${courseId}:vespera:material`,
      verdict: final,
      professorsUsed: chain.professorsUsed,
    })
  } else {
    applied = await applyCorrections(courseId, 'vespera', {}, final.corrections || [])
  }

  await saveHistory({
    courseId,
    itemType: 'vespera',
    dedupeKey: `${courseId}:vespera:material`,
    verdict: final,
    professorsUsed: chain.professorsUsed,
    appliedCount: applied,
    reviewId,
    autoApplied: !needsAdmin,
  })

  return { summary: final.summary, applied, needsAdmin, reviewId, professorsUsed: chain.professorsUsed }
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
    contextBlock += `\nTAREFA EXTRA: Se o tema estiver desatualizado ou fraco, proponha novo tema de redação para concurso (campo corrections target redacao).`
  }

  const chain = await runProfessorChain(contextBlock, updateJob, userId, jobId)
  const final = chain.final
  const needsAdmin = final.needsAdminReview || payload.rotateTheme && (final.confidence || 0) < 0.85
  let applied = 0
  let reviewId = null

  if (needsAdmin) {
    reviewId = await saveAdminReview({
      courseId,
      itemType: 'redacao',
      payload,
      dedupeKey: `${courseId}:redacao:${payload.targetDate || 'rotate'}`,
      verdict: final,
      professorsUsed: chain.professorsUsed,
    })
  } else {
    applied = await applyCorrections(courseId, 'redacao', payload, final.corrections || [])
  }

  await saveHistory({
    courseId,
    itemType: 'redacao',
    dedupeKey: `${courseId}:redacao:${payload.targetDate || 'rotate'}`,
    verdict: final,
    professorsUsed: chain.professorsUsed,
    appliedCount: applied,
    reviewId,
    autoApplied: !needsAdmin,
  })

  return { summary: final.summary, applied, needsAdmin, reviewId, professorsUsed: chain.professorsUsed }
}

async function processProfessorSupervisor(userId, jobId, courseId, serverPayload, updateJob) {
  const { queueItemId, itemType, payload = {} } = serverPayload || {}

  await throwIfCancelled(userId, jobId)
  await touchActiveJob(userId, jobId, { jobType: 'professor_supervisor', courseId, status: 'running' })

  await updateJob(userId, jobId, {
    status: 'running',
    progress: 10,
    message: `Professor fiscalizador — ${itemType}…`,
  })

  let outcome

  try {
    switch (itemType) {
      case 'topico':
        outcome = await processTopicoItem(courseId, payload, updateJob, userId, jobId)
        break
      case 'flag':
        outcome = await processFlagItem(courseId, payload, updateJob, userId, jobId)
        break
      case 'vespera':
        outcome = await processVesperaItem(courseId, updateJob, userId, jobId)
        break
      case 'redacao':
        outcome = await processRedacaoItem(courseId, payload, updateJob, userId, jobId)
        break
      default:
        throw new Error(`Tipo de fiscalização não suportado: ${itemType}`)
    }

    if (queueItemId) {
      await finishQueueItem(queueItemId, outcome.skipped ? 'skipped' : 'done')
    }

    await clearActiveJob(jobId)

    const msg = outcome.skipped
      ? `Checagem OK — ${outcome.reason || 'sem IA'}`
      : outcome.needsAdmin
        ? `Veredito pronto — aguardando admin (${outcome.professorsUsed} professor(es))`
        : `Concluído — ${outcome.applied || 0} correção(ões) aplicada(s)`

    await updateJob(userId, jobId, {
      status: 'done',
      progress: 100,
      message: msg,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return outcome
  } catch (err) {
    if (queueItemId) {
      await finishQueueItem(queueItemId, isJobCancelledError(err) ? 'cancelled' : 'error')
    }
    await clearActiveJob(jobId)

    if (isJobCancelledError(err) || (await isJobCancelled(userId, jobId))) {
      return { cancelled: true }
    }

    if (isApiQuotaError(err)) {
      await pauseJobForResume({
        userId,
        jobId,
        courseId,
        jobType: 'professor_supervisor',
        serverPayload,
        updateJob,
        status: 'waiting_api',
        waitReason: 'api',
        message: 'API expirada — fiscalizador aguardando…',
      })
      return { paused: true }
    }

    await pauseJobForResume({
      userId,
      jobId,
      courseId,
      jobType: 'professor_supervisor',
      serverPayload,
      updateJob,
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
