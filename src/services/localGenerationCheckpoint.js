/**
 * Checkpoints de geração local — salva cada lote/fase e retoma sem gastar API de novo.
 * Coleção: courses/{courseId}/generationCheckpoints/{topicKey}__{asset}
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  normalizeTopicKeyForStorage,
  sanitizeTopicKeyForFirestore,
  toSafeFirestoreDocId,
} from '../utils/topicKeyFirestore'

export const ASSET = {
  FLASHCARDS: 'flashcards',
  MATERIAL: 'material',
  QUESTOES: 'questoes',
  BUNDLE: 'bundle',
}

export const FLASHCARD_TARGET = 30
export const FLASHCARD_BATCH_SIZE = 10

/** ID canônico (mesmo do aluno/edital). */
function contentDocId(topicKey = '') {
  return (
    toSafeFirestoreDocId(topicKey) ||
    sanitizeTopicKeyForFirestore(normalizeTopicKeyForStorage(topicKey)) ||
    'topic_unknown'
  )
}

/** ID antigo agressivo — só para migrar/atualizar docs já salvos. */
export function legacyAggressiveTopicKey(topicKey = '') {
  return String(topicKey)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120)
}

function sanitizeTopicKey(topicKey = '') {
  return contentDocId(topicKey)
}

function checkpointDocId(topicKey, assetType, { nivel = 1 } = {}) {
  const base = sanitizeTopicKey(topicKey)
  if (assetType === ASSET.QUESTOES) return `${base}__questoes_n${nivel}`
  return `${base}__${assetType}`
}

function checkpointRef(courseId, topicKey, assetType, opts = {}) {
  return doc(db, 'courses', courseId, 'generationCheckpoints', checkpointDocId(topicKey, assetType, opts))
}

function isPermissionError(err) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return (
    code === 'permission-denied' ||
    code.includes('permission') ||
    msg.toLowerCase().includes('insufficient permissions') ||
    msg.toLowerCase().includes('permission-denied')
  )
}

/** Checkpoint nunca deve derrubar a geração — só otimiza API. */
async function softCheckpoint(label, fn, fallback = null) {
  try {
    return await fn()
  } catch (err) {
    if (isPermissionError(err)) {
      console.warn(`[checkpoint] ${label}: sem permissão (rules?) — seguindo sem checkpoint`, err.message)
      return fallback
    }
    console.warn(`[checkpoint] ${label}:`, err?.message || err)
    return fallback
  }
}

export async function loadCheckpoint(courseId, topicKey, assetType, opts = {}) {
  return softCheckpoint(`load ${assetType}`, async () => {
    const snap = await getDoc(checkpointRef(courseId, topicKey, assetType, opts))
    if (!snap.exists()) return null
    return snap.data()
  }, null)
}

export async function upsertCheckpoint(courseId, topicKey, assetType, patch, opts = {}) {
  await softCheckpoint(`upsert ${assetType}`, async () => {
    await setDoc(
      checkpointRef(courseId, topicKey, assetType, opts),
      {
        topicKey,
        assetType,
        ...patch,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

export async function markCheckpointComplete(courseId, topicKey, assetType, jobId, opts = {}) {
  await upsertCheckpoint(
    courseId,
    topicKey,
    assetType,
    { jobId: jobId || null, complete: true, generationDraft: false },
    opts,
  )
}

export async function clearCheckpoint(courseId, topicKey, assetType, opts = {}) {
  await softCheckpoint(`clear ${assetType}`, async () => {
    await deleteDoc(checkpointRef(courseId, topicKey, assetType, opts))
  })
}

function inferFlashcardStartBatch(existingCount, batchesCompleted = 0) {
  const batchCount = Math.ceil(FLASHCARD_TARGET / FLASHCARD_BATCH_SIZE)
  const completed = Math.max(
    Number(batchesCompleted) || 0,
    Math.ceil(existingCount / FLASHCARD_BATCH_SIZE),
  )
  if (existingCount >= FLASHCARD_TARGET) return batchCount + 1
  return Math.min(completed + 1, batchCount + 1)
}

export async function loadFlashcardsByTopicKey(courseId, topicKey) {
  if (!topicKey) return []
  const q = query(
    collection(db, 'courses', courseId, 'flashcards'),
    where('topicKey', '==', topicKey),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/**
 * Prepara flashcards: reusa cards já salvos (mesmo tópico) e retoma do próximo lote.
 * forceFresh=true apaga e recomeça.
 */
export async function prepareFlashcardsRun({
  courseId,
  topicKey,
  jobId,
  forceFresh = false,
}) {
  const cp = await loadCheckpoint(courseId, topicKey, ASSET.FLASHCARDS)

  if (forceFresh) {
    const existing = await loadFlashcardsByTopicKey(courseId, topicKey)
    await deleteFlashcardDocs(courseId, existing.map((c) => c.id))
    await clearCheckpoint(courseId, topicKey, ASSET.FLASHCARDS)
    return { resume: false, existingItems: [], existingIds: [], startBatch: 1, alreadyComplete: false }
  }

  if (cp?.complete) {
    const saved = await loadFlashcardsByTopicKey(courseId, topicKey)
    if (saved.length >= FLASHCARD_TARGET - 2) {
      return {
        resume: true,
        alreadyComplete: true,
        existingItems: saved.map(cardFromDoc),
        existingIds: saved.map((c) => c.id),
        startBatch: Math.ceil(FLASHCARD_TARGET / FLASHCARD_BATCH_SIZE) + 1,
      }
    }
  }

  const saved = await loadFlashcardsByTopicKey(courseId, topicKey)
  // Retoma drafts / parciais do tópico (qualquer job) — evita regastar API
  const usable = saved.filter(
    (c) => c.generationDraft === true || c.generationComplete === true || c.source === 'local_admin_generation',
  )

  if (usable.length > 0) {
    const startBatch = inferFlashcardStartBatch(usable.length, cp?.batchesCompleted)
    await upsertCheckpoint(courseId, topicKey, ASSET.FLASHCARDS, {
      jobId: jobId || cp?.jobId || null,
      batchesCompleted: Math.max(0, startBatch - 1),
      itemCount: usable.length,
      complete: usable.length >= FLASHCARD_TARGET,
      generationDraft: usable.length < FLASHCARD_TARGET,
    })
    return {
      resume: true,
      alreadyComplete: usable.length >= FLASHCARD_TARGET - 2,
      existingItems: usable.map(cardFromDoc),
      existingIds: usable.map((c) => c.id),
      startBatch,
    }
  }

  return { resume: false, existingItems: [], existingIds: [], startBatch: 1, alreadyComplete: false }
}

function cardFromDoc(docData) {
  return {
    id: docData.id,
    pergunta: docData.pergunta || docData.frente,
    resposta: docData.resposta || docData.verso,
    frente: docData.frente || docData.pergunta,
    verso: docData.verso || docData.resposta,
    dificuldade: docData.dificuldade || 'médio',
    prioridade: docData.prioridade || 'alta',
  }
}

async function deleteFlashcardDocs(courseId, ids = []) {
  if (!ids.length) return
  let batch = writeBatch(db)
  let n = 0
  for (const id of ids) {
    batch.delete(doc(db, 'courses', courseId, 'flashcards', id))
    n += 1
    if (n >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      n = 0
    }
  }
  if (n > 0) await batch.commit()
}

/** Salva um lote auditado e grava checkpoint imediatamente. */
export async function appendFlashcardBatch({
  courseId,
  jobId,
  meta,
  batchItems,
  batchNum,
  draftStatus = 'indisponivel',
  startOrder = 0,
}) {
  const flashcardsRef = collection(db, 'courses', courseId, 'flashcards')
  const ids = []
  let order = startOrder

  for (const item of batchItems) {
    const pergunta = String(item.pergunta || item.frente || '').trim()
    const resposta = String(item.resposta || item.verso || '').trim()
    if (!pergunta || !resposta) continue
    const ref = await addDoc(flashcardsRef, {
      pergunta,
      resposta,
      frente: pergunta,
      verso: resposta,
      dificuldade: item.dificuldade || 'médio',
      prioridade: item.prioridade || 'alta',
      materia: meta.disciplina || meta.materia || '',
      modulo: meta.modulo || '',
      topico: meta.topicoNome || meta.topico || '',
      topicKey: meta.topicKey || null,
      topicoNumero: meta.topicoNumero || null,
      banca: meta.banca || '',
      cargo: meta.cargo || '',
      concurso: meta.concursoName || meta.courseName || '',
      courseId,
      status: draftStatus,
      generationJobId: jobId || null,
      generationDraft: true,
      generationComplete: false,
      checkpointBatch: batchNum,
      order,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      source: 'local_admin_generation',
    })
    ids.push(ref.id)
    order += 1
  }

  await upsertCheckpoint(courseId, meta.topicKey, ASSET.FLASHCARDS, {
    jobId: jobId || null,
    batchesCompleted: batchNum,
    itemCount: startOrder + ids.length,
    complete: false,
    generationDraft: true,
  })

  return { ids, count: ids.length }
}

export async function finalizeFlashcardsCheckpoint({
  courseId,
  topicKey,
  jobId,
  cardIds = [],
  finalStatus = 'indisponivel',
}) {
  if (cardIds.length) {
    const batch = writeBatch(db)
    for (const id of cardIds) {
      batch.update(doc(db, 'courses', courseId, 'flashcards', id), {
        generationDraft: false,
        generationComplete: true,
        status: finalStatus,
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  }
  await markCheckpointComplete(courseId, topicKey, ASSET.FLASHCARDS, jobId)
}

export async function loadMaterialDraft(courseId, topicKey) {
  const key = contentDocId(topicKey)
  const legacy = legacyAggressiveTopicKey(topicKey)
  for (const id of [key, legacy]) {
    if (!id) continue
    const snap = await getDoc(doc(db, 'courses', courseId, 'conteudosCompletos', id))
    if (snap.exists()) return { id: snap.id, ...snap.data() }
  }
  return null
}

/**
 * Se material já existe e está completo (ou draft válido), reusa sem API.
 */
export async function prepareMaterialRun({ courseId, topicKey, jobId, forceFresh = false }) {
  const cp = await loadCheckpoint(courseId, topicKey, ASSET.MATERIAL)

  if (forceFresh) {
    const key = contentDocId(topicKey)
    const legacy = legacyAggressiveTopicKey(topicKey)
    await deleteDoc(doc(db, 'courses', courseId, 'conteudosCompletos', key)).catch(() => {})
    if (legacy && legacy !== key) {
      await deleteDoc(doc(db, 'courses', courseId, 'conteudosCompletos', legacy)).catch(() => {})
    }
    await clearCheckpoint(courseId, topicKey, ASSET.MATERIAL)
    return { resume: false, alreadyComplete: false, existingDraft: null }
  }

  const draft = await loadMaterialDraft(courseId, topicKey)
  const hasContent = Boolean(
    draft &&
      (draft.revisaoTurbo?.length ||
        draft.content ||
        draft.secoes?.length ||
        draft.raioXProbabilidade ||
        draft.titulo),
  )

  if (hasContent && (cp?.complete || draft.generationComplete === true || draft.status === 'disponivel')) {
    return { resume: true, alreadyComplete: true, existingDraft: draft }
  }

  if (hasContent) {
    await upsertCheckpoint(courseId, topicKey, ASSET.MATERIAL, {
      jobId: jobId || cp?.jobId || null,
      complete: true,
      generationDraft: false,
    })
    return { resume: true, alreadyComplete: true, existingDraft: draft }
  }

  return { resume: false, alreadyComplete: false, existingDraft: null }
}

export async function saveMaterialCheckpoint({
  courseId,
  topicKey,
  jobId,
  parsed,
  extra = {},
  status = 'indisponivel',
}) {
  const key = contentDocId(topicKey)
  const normalized = normalizeTopicKeyForStorage(topicKey)
  const payload = {
    ...parsed,
    ...extra,
    topicKey: normalized || topicKey,
    generationJobId: jobId || null,
    generationDraft: false,
    generationComplete: true,
    status,
    updatedAt: serverTimestamp(),
    generatedAt: serverTimestamp(),
  }
  await setDoc(doc(db, 'courses', courseId, 'conteudosCompletos', key), payload, { merge: true })

  // Migra/atualiza doc legado (ID agressivo) se existir
  const legacy = legacyAggressiveTopicKey(topicKey)
  if (legacy && legacy !== key) {
    const legacyRef = doc(db, 'courses', courseId, 'conteudosCompletos', legacy)
    const legacySnap = await getDoc(legacyRef)
    if (legacySnap.exists()) {
      await setDoc(legacyRef, { ...payload, migratedTo: key }, { merge: true })
    }
  }

  await markCheckpointComplete(courseId, topicKey, ASSET.MATERIAL, jobId)
}

export async function loadQuestoesDraft(courseId, topicKey, nivel = 1) {
  const canonical = `${contentDocId(topicKey)}_nivel_${nivel}`
  const legacy = `${legacyAggressiveTopicKey(topicKey)}_nivel_${nivel}`
  for (const id of [canonical, legacy]) {
    if (!id || id.startsWith('_')) continue
    const snap = await getDoc(doc(db, 'courses', courseId, 'questoesTopico', id))
    if (snap.exists()) return { id: snap.id, ...snap.data() }
  }
  return null
}

export async function prepareQuestoesRun({
  courseId,
  topicKey,
  jobId,
  nivel = 1,
  forceFresh = false,
  minCount = 1,
}) {
  const key = `${sanitizeTopicKey(topicKey)}_nivel_${nivel}`
  const cp = await loadCheckpoint(courseId, topicKey, ASSET.QUESTOES, { nivel })

  if (forceFresh) {
    await deleteDoc(doc(db, 'courses', courseId, 'questoesTopico', key)).catch(() => {})
    await clearCheckpoint(courseId, topicKey, ASSET.QUESTOES, { nivel })
    return { resume: false, alreadyComplete: false, existingDraft: null }
  }

  const draft = await loadQuestoesDraft(courseId, topicKey, nivel)
  const list = draft?.questoes || draft?.questions || []
  const hasContent = list.length >= minCount

  if (
    hasContent &&
    (cp?.complete || draft.generationComplete === true || draft.status === 'disponivel')
  ) {
    return { resume: true, alreadyComplete: true, existingDraft: draft }
  }

  if (hasContent) {
    await upsertCheckpoint(
      courseId,
      topicKey,
      ASSET.QUESTOES,
      { jobId: jobId || cp?.jobId || null, complete: true, generationDraft: false, itemCount: list.length },
      { nivel },
    )
    return { resume: true, alreadyComplete: true, existingDraft: draft }
  }

  return { resume: false, alreadyComplete: false, existingDraft: null }
}

export async function saveQuestoesCheckpoint({
  courseId,
  topicKey,
  jobId,
  nivel = 1,
  parsed,
  extra = {},
  status = 'indisponivel',
}) {
  const key = `${contentDocId(topicKey)}_nivel_${nivel}`
  const normalized = normalizeTopicKeyForStorage(topicKey)
  const list = parsed?.questoes || parsed?.questions || []
  const payload = {
    ...parsed,
    ...extra,
    topicKey: normalized || topicKey,
    nivel,
    generationJobId: jobId || null,
    generationDraft: false,
    generationComplete: true,
    status,
    updatedAt: serverTimestamp(),
    generatedAt: serverTimestamp(),
  }
  await setDoc(doc(db, 'courses', courseId, 'questoesTopico', key), payload, { merge: true })

  const legacyKey = `${legacyAggressiveTopicKey(topicKey)}_nivel_${nivel}`
  if (legacyKey && legacyKey !== key) {
    const legacyRef = doc(db, 'courses', courseId, 'questoesTopico', legacyKey)
    const legacySnap = await getDoc(legacyRef)
    if (legacySnap.exists()) {
      await setDoc(legacyRef, { ...payload, migratedTo: key }, { merge: true })
    }
  }

  await markCheckpointComplete(courseId, topicKey, ASSET.QUESTOES, jobId, { nivel })
  return list.length
}

/** Bundle audit passou → não reauditar no retry. */
export async function prepareBundleAudit({ courseId, topicKey, forceFresh = false }) {
  if (forceFresh) {
    await clearCheckpoint(courseId, topicKey, ASSET.BUNDLE)
    return { alreadyPassed: false }
  }
  const cp = await loadCheckpoint(courseId, topicKey, ASSET.BUNDLE)
  if (cp?.complete && cp?.aprovado === true) {
    return { alreadyPassed: true, checkpoint: cp }
  }
  return { alreadyPassed: false }
}

export async function markBundleAuditPassed(courseId, topicKey, jobId) {
  await upsertCheckpoint(courseId, topicKey, ASSET.BUNDLE, {
    jobId: jobId || null,
    complete: true,
    aprovado: true,
    generationDraft: false,
  })
}

export async function setFlashcardsStatus(courseId, cardIds = [], status) {
  if (!cardIds.length) return
  const batch = writeBatch(db)
  for (const id of cardIds) {
    batch.update(doc(db, 'courses', courseId, 'flashcards', id), {
      status,
      updatedAt: serverTimestamp(),
    })
  }
  await batch.commit()
}

export { sanitizeTopicKey }
