/**
 * Checkpoints de geração — salva progresso parcial e retoma no mesmo jobId.
 */

const admin = require('firebase-admin')
const { sanitizeTopicKeyForFirestore, normalizeTopicKeyForStorage } = require('./topicKeyUtils')
const { sanitizeFlashcardText } = require('./aiTextFormatting')
const { MIN_FLASHCARDS, MAX_FLASHCARDS } = require('./flashcardsValidate')

const ASSET = {
  FLASHCARDS: 'flashcards',
  MATERIAL: 'material',
  QUESTOES: 'questoes',
}

const QUESTOES_BATCH_SIZE = 10
const DEFAULT_QUESTOES_COUNT = 50
const MATERIAL_PHASE_CORE = 1
const MATERIAL_PHASE_EXTRAS = 2

function getDb() {
  return admin.firestore()
}

function checkpointDocId(topicKey, assetType, { nivel = 1 } = {}) {
  const base = sanitizeTopicKeyForFirestore(topicKey)
  if (assetType === ASSET.QUESTOES) return `${base}__questoes_n${nivel}`
  return `${base}__${assetType}`
}

function checkpointRef(courseId, topicKey, assetType, opts = {}) {
  return getDb().doc(
    `courses/${courseId}/generationCheckpoints/${checkpointDocId(topicKey, assetType, opts)}`,
  )
}

async function loadCheckpoint(courseId, topicKey, assetType, jobId, opts = {}) {
  const snap = await checkpointRef(courseId, topicKey, assetType, opts).get()
  if (!snap.exists) return null
  const data = snap.data() || {}
  if (data.complete) return { ...data, canResume: false }
  if (jobId && data.jobId && data.jobId !== jobId) {
    return { ...data, canResume: false, stale: true }
  }
  return { ...data, canResume: true }
}

async function upsertCheckpoint(courseId, topicKey, assetType, patch, opts = {}) {
  const ts = admin.firestore.FieldValue.serverTimestamp()
  await checkpointRef(courseId, topicKey, assetType, opts).set(
    {
      topicKey: normalizeTopicKeyForStorage(topicKey) || topicKey,
      assetType,
      ...patch,
      updatedAt: ts,
    },
    { merge: true },
  )
}

async function markCheckpointComplete(courseId, topicKey, assetType, jobId, opts = {}) {
  await upsertCheckpoint(
    courseId,
    topicKey,
    assetType,
    { jobId, complete: true, generationDraft: false },
    opts,
  )
}

async function clearCheckpoint(courseId, topicKey, assetType, opts = {}) {
  await checkpointRef(courseId, topicKey, assetType, opts).delete().catch(() => {})
}

async function deleteTopicFlashcards(courseId, topicKey, disciplina, modulo) {
  const db = getDb()
  const flashcardsRef = db.collection(`courses/${courseId}/flashcards`)
  const normalized = normalizeTopicKeyForStorage(topicKey)

  let docs = []
  if (normalized) {
    const byTopic = await flashcardsRef.where('topicKey', '==', normalized).get()
    docs = byTopic.docs
  }
  if (!docs.length && disciplina && modulo) {
    const byModule = await flashcardsRef
      .where('materia', '==', disciplina)
      .where('modulo', '==', modulo)
      .get()
    docs = byModule.docs
  }
  if (!docs.length) return

  let batch = db.batch()
  let count = 0
  for (const d of docs) {
    batch.delete(d.ref)
    count += 1
    if (count >= 400) {
      await batch.commit()
      batch = db.batch()
      count = 0
    }
  }
  if (count > 0) await batch.commit()
}

async function loadFlashcardsForJob(courseId, topicKey, jobId) {
  const normalized = normalizeTopicKeyForStorage(topicKey)
  if (!normalized || !jobId) return []
  const snap = await getDb()
    .collection(`courses/${courseId}/flashcards`)
    .where('topicKey', '==', normalized)
    .where('generationJobId', '==', jobId)
    .get()
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function flashcardDocToItem(doc) {
  return {
    frente: doc.frente || doc.pergunta,
    verso: doc.verso || doc.resposta,
    pergunta: doc.pergunta || doc.frente,
    resposta: doc.resposta || doc.verso,
    dificuldade: doc.dificuldade || 'médio',
  }
}

async function prepareFlashcardsRun({ courseId, topicKey, jobId, meta, forceFresh = false }) {
  const cp = await loadCheckpoint(courseId, topicKey, ASSET.FLASHCARDS, jobId)
  const resume = !forceFresh && cp?.canResume && cp?.jobId === jobId

  if (forceFresh || cp?.stale) {
    await deleteTopicFlashcards(courseId, topicKey, meta?.disciplina, meta?.modulo)
    await clearCheckpoint(courseId, topicKey, ASSET.FLASHCARDS)
    return { resume: false, existingItems: [], startBatch: 1 }
  }

  if (resume) {
    const saved = await loadFlashcardsForJob(courseId, topicKey, jobId)
    const existingItems = saved.map(flashcardDocToItem)
    const batchesCompleted = cp?.batchesCompleted || Math.ceil(existingItems.length / 10)
    const startBatch = Math.min(batchesCompleted + 1, Math.ceil(MAX_FLASHCARDS / 10) + 1)
    return { resume: true, existingItems, startBatch, checkpoint: cp }
  }

  return { resume: false, existingItems: [], startBatch: 1 }
}

async function appendFlashcardBatch({
  courseId,
  jobId,
  meta,
  batchItems,
  batchNum,
  draftStatus,
  startOrder,
}) {
  const db = getDb()
  const normalizedTopicKey = normalizeTopicKeyForStorage(meta.topicKey)
  const flashcardsRef = db.collection(`courses/${courseId}/flashcards`)
  let batch = db.batch()
  let opCount = 0
  const ts = admin.firestore.FieldValue.serverTimestamp()

  batchItems.forEach((item, offset) => {
    const docRef = flashcardsRef.doc()
    const frente = sanitizeFlashcardText(item.frente || item.pergunta || '')
    const verso = sanitizeFlashcardText(item.verso || item.resposta || '')
    batch.set(docRef, {
      disciplina: meta.disciplina,
      materia: meta.disciplina,
      topico: meta.topicoNome,
      topicoNumero: meta.topicoNumero || '',
      modulo: meta.modulo,
      topicKey: normalizedTopicKey,
      frente,
      verso,
      pergunta: frente,
      resposta: verso,
      dificuldade: item.dificuldade || 'médio',
      courseId,
      shared: true,
      status: draftStatus,
      generationJobId: jobId,
      generationDraft: true,
      generationComplete: false,
      checkpointBatch: batchNum,
      createdAt: ts,
      updatedAt: ts,
      order: startOrder + offset,
    })
    opCount += 1
  })

  if (opCount > 0) await batch.commit()

  await upsertCheckpoint(courseId, meta.topicKey, ASSET.FLASHCARDS, {
    jobId,
    batchesCompleted: batchNum,
    itemCount: startOrder + batchItems.length,
    complete: false,
    generationDraft: true,
  })
}

async function finalizeFlashcardsCheckpoint({ courseId, topicKey, jobId, finalStatus, meta }) {
  const normalized = normalizeTopicKeyForStorage(topicKey)
  const snap = await getDb()
    .collection(`courses/${courseId}/flashcards`)
    .where('topicKey', '==', normalized)
    .where('generationJobId', '==', jobId)
    .get()

  if (!snap.empty) {
    let batch = getDb().batch()
    let count = 0
    const ts = admin.firestore.FieldValue.serverTimestamp()
    for (const d of snap.docs) {
      batch.update(d.ref, {
        generationDraft: false,
        generationComplete: true,
        status: finalStatus,
        updatedAt: ts,
      })
      count += 1
      if (count >= 400) {
        await batch.commit()
        batch = getDb().batch()
        count = 0
      }
    }
    if (count > 0) await batch.commit()
  }

  await markCheckpointComplete(courseId, topicKey, ASSET.FLASHCARDS, jobId)
}

async function isFlashcardsComplete(courseId, topicKey, disciplina, modulo) {
  const cp = await loadCheckpoint(courseId, topicKey, ASSET.FLASHCARDS)
  if (cp?.complete) return true

  const normalized = normalizeTopicKeyForStorage(topicKey)
  const db = getDb()
  let docs = []

  if (normalized) {
    const byTopic = await db
      .collection(`courses/${courseId}/flashcards`)
      .where('topicKey', '==', normalized)
      .get()
    docs = byTopic.docs
  }
  if (!docs.length && disciplina && modulo) {
    const byModule = await db
      .collection(`courses/${courseId}/flashcards`)
      .where('materia', '==', disciplina)
      .where('modulo', '==', modulo)
      .get()
    docs = byModule.docs
  }

  const completeCards = docs.filter((d) => {
    const data = d.data()
    if (data.generationDraft === true) return false
    if (data.generationComplete === false) return false
    return true
  })

  return completeCards.length >= MIN_FLASHCARDS
}

async function loadMaterialDraft(courseId, topicKey) {
  const key = sanitizeTopicKeyForFirestore(topicKey)
  const snap = await getDb().doc(`courses/${courseId}/conteudosCompletos/${key}`).get()
  if (!snap.exists) return null
  return snap.data()
}

async function prepareMaterialRun({ courseId, topicKey, jobId, forceFresh = false }) {
  const cp = await loadCheckpoint(courseId, topicKey, ASSET.MATERIAL, jobId)
  const resume = !forceFresh && cp?.canResume && cp?.jobId === jobId

  if (forceFresh || cp?.stale) {
    const key = sanitizeTopicKeyForFirestore(topicKey)
    await getDb().doc(`courses/${courseId}/conteudosCompletos/${key}`).delete().catch(() => {})
    await clearCheckpoint(courseId, topicKey, ASSET.MATERIAL)
    return { resume: false, startPhase: 1, existingDraft: null }
  }

  if (resume) {
    const draft = await loadMaterialDraft(courseId, topicKey)
    const phase = cp?.materialPhase || 0
    if (phase >= MATERIAL_PHASE_CORE && draft) {
      return {
        resume: true,
        startPhase: phase >= MATERIAL_PHASE_EXTRAS ? MATERIAL_PHASE_EXTRAS + 1 : MATERIAL_PHASE_EXTRAS,
        existingDraft: draft,
        checkpoint: cp,
      }
    }
  }

  return { resume: false, startPhase: 1, existingDraft: null }
}

async function saveMaterialPhaseDraft({
  courseId,
  topicKey,
  parsed,
  jobId,
  phase,
  extraFields = {},
}) {
  const key = sanitizeTopicKeyForFirestore(topicKey)
  const ts = admin.firestore.FieldValue.serverTimestamp()
  await getDb()
    .doc(`courses/${courseId}/conteudosCompletos/${key}`)
    .set(
      {
        ...parsed,
        topicKey: normalizeTopicKeyForStorage(topicKey) || topicKey,
        generationJobId: jobId,
        generationDraft: phase < MATERIAL_PHASE_EXTRAS,
        materialPhase: phase,
        status: 'indisponivel',
        updatedAt: ts,
        ...extraFields,
      },
      { merge: true },
    )

  await upsertCheckpoint(courseId, topicKey, ASSET.MATERIAL, {
    jobId,
    materialPhase: phase,
    complete: phase >= MATERIAL_PHASE_EXTRAS,
    generationDraft: phase < MATERIAL_PHASE_EXTRAS,
  })
}

async function finalizeMaterialCheckpoint({ courseId, topicKey, jobId, finalStatus, extraFields = {} }) {
  const key = sanitizeTopicKeyForFirestore(topicKey)
  const ts = admin.firestore.FieldValue.serverTimestamp()
  await getDb()
    .doc(`courses/${courseId}/conteudosCompletos/${key}`)
    .set(
      {
        generationDraft: false,
        generationComplete: true,
        materialPhase: MATERIAL_PHASE_EXTRAS,
        status: finalStatus,
        updatedAt: ts,
        ...extraFields,
      },
      { merge: true },
    )
  await markCheckpointComplete(courseId, topicKey, ASSET.MATERIAL, jobId)
}

async function isMaterialComplete(courseId, topicKey) {
  const cp = await loadCheckpoint(courseId, topicKey, ASSET.MATERIAL)
  if (cp?.complete) return true
  const draft = await loadMaterialDraft(courseId, topicKey)
  if (!draft) return false
  if (draft.generationDraft === true) return false
  if (draft.generationComplete === false) return false
  return Boolean(draft.revisaoTurbo?.length || draft.content || draft.secoes?.length)
}

async function loadQuestoesDraft(courseId, topicKey, nivel = 1) {
  const key = `${sanitizeTopicKeyForFirestore(topicKey)}_nivel_${nivel}`
  const snap = await getDb().doc(`courses/${courseId}/questoesTopico/${key}`).get()
  if (!snap.exists) return null
  return snap.data()
}

async function prepareQuestoesRun({ courseId, topicKey, jobId, nivel = 1, forceFresh = false }) {
  const cp = await loadCheckpoint(courseId, topicKey, ASSET.QUESTOES, jobId, { nivel })
  const resume = !forceFresh && cp?.canResume && cp?.jobId === jobId

  if (forceFresh || cp?.stale) {
    const key = `${sanitizeTopicKeyForFirestore(topicKey)}_nivel_${nivel}`
    await getDb().doc(`courses/${courseId}/questoesTopico/${key}`).delete().catch(() => {})
    await clearCheckpoint(courseId, topicKey, ASSET.QUESTOES, { nivel })
    return { resume: false, existingQuestoes: [], startBatch: 1, existingParsed: null }
  }

  if (resume) {
    const draft = await loadQuestoesDraft(courseId, topicKey, nivel)
    const existingQuestoes = draft?.questoes || draft?.questions || []
    const batchesCompleted = cp?.batchesCompleted || Math.ceil(existingQuestoes.length / QUESTOES_BATCH_SIZE)
    const batchCount = Math.ceil(DEFAULT_QUESTOES_COUNT / QUESTOES_BATCH_SIZE)
    return {
      resume: true,
      existingQuestoes,
      existingParsed: draft,
      startBatch: Math.min(batchesCompleted + 1, batchCount + 1),
      checkpoint: cp,
    }
  }

  return { resume: false, existingQuestoes: [], startBatch: 1, existingParsed: null }
}

async function appendQuestoesBatch({
  courseId,
  topicKey,
  jobId,
  nivel,
  batchQuestoes,
  batchNum,
  parsedBase,
  extraFields = {},
}) {
  const key = `${sanitizeTopicKeyForFirestore(topicKey)}_nivel_${nivel}`
  const existing = parsedBase?.questoes || parsedBase?.questions || []
  const mergedList = [...existing, ...batchQuestoes]
  const ts = admin.firestore.FieldValue.serverTimestamp()

  const payload = {
    ...(parsedBase || {}),
    questoes: mergedList,
    topicKey: normalizeTopicKeyForStorage(topicKey) || topicKey,
    nivel,
    generationJobId: jobId,
    generationDraft: true,
    generationComplete: false,
    status: 'indisponivel',
    updatedAt: ts,
    ...extraFields,
  }

  await getDb().doc(`courses/${courseId}/questoesTopico/${key}`).set(payload, { merge: true })

  await upsertCheckpoint(
    courseId,
    topicKey,
    ASSET.QUESTOES,
    {
      jobId,
      batchesCompleted: batchNum,
      itemCount: mergedList.length,
      complete: false,
      generationDraft: true,
    },
    { nivel },
  )

  return { ...payload, questoes: mergedList }
}

async function finalizeQuestoesCheckpoint({ courseId, topicKey, jobId, nivel, finalStatus, extraFields = {} }) {
  const key = `${sanitizeTopicKeyForFirestore(topicKey)}_nivel_${nivel}`
  const ts = admin.firestore.FieldValue.serverTimestamp()
  await getDb()
    .doc(`courses/${courseId}/questoesTopico/${key}`)
    .set(
      {
        generationDraft: false,
        generationComplete: true,
        status: finalStatus,
        updatedAt: ts,
        ...extraFields,
      },
      { merge: true },
    )
  await markCheckpointComplete(courseId, topicKey, ASSET.QUESTOES, jobId, { nivel })
}

async function isQuestoesComplete(courseId, topicKey, nivel = 1) {
  const cp = await loadCheckpoint(courseId, topicKey, ASSET.QUESTOES, null, { nivel })
  if (cp?.complete) return true
  const draft = await loadQuestoesDraft(courseId, topicKey, nivel)
  if (!draft) return false
  if (draft.generationDraft === true) return false
  if (draft.generationComplete === false) return false
  const list = draft.questoes || draft.questions || []
  return list.length >= DEFAULT_QUESTOES_COUNT
}

module.exports = {
  ASSET,
  QUESTOES_BATCH_SIZE,
  DEFAULT_QUESTOES_COUNT,
  MATERIAL_PHASE_CORE,
  MATERIAL_PHASE_EXTRAS,
  loadCheckpoint,
  upsertCheckpoint,
  markCheckpointComplete,
  clearCheckpoint,
  deleteTopicFlashcards,
  prepareFlashcardsRun,
  appendFlashcardBatch,
  finalizeFlashcardsCheckpoint,
  isFlashcardsComplete,
  prepareMaterialRun,
  saveMaterialPhaseDraft,
  finalizeMaterialCheckpoint,
  isMaterialComplete,
  prepareQuestoesRun,
  appendQuestoesBatch,
  finalizeQuestoesCheckpoint,
  isQuestoesComplete,
  loadMaterialDraft,
  loadQuestoesDraft,
}
