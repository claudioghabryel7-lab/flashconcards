import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { sanitizeTopicKeyForFirestore } from '../utils/topicKeyFirestore'

const MAX_BATCH = 450

async function commitBatches(operations) {
  for (let i = 0; i < operations.length; i += MAX_BATCH) {
    const batch = writeBatch(db)
    operations.slice(i, i + MAX_BATCH).forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: true })
    })
    await batch.commit()
  }
}

/** Mapa topicKey (encoded) → status de publicação */
export async function loadTopicoPublishMap(courseId) {
  const resolvedId = courseId || 'alego-default'
  const snap = await getDocs(collection(db, 'courses', resolvedId, 'topicoStatus'))
  const map = {}
  snap.docs.forEach((d) => {
    const data = d.data()
    if (data.topicKey) {
      map[data.topicKey] = data.status || CONTENT_STATUS.UNAVAILABLE
    }
  })
  return map
}

/**
 * Disponibiliza ou bloqueia todos os recursos de um tópico:
 * flashcards, questões preditivas (níveis 1–10) e conteúdo completo.
 */
export async function setTopicoPublishStatus(courseId, topicKey, status) {
  if (!topicKey?.trim()) {
    throw new Error('Tópico inválido')
  }

  const resolvedId = courseId || 'alego-default'
  const sanitizedKey = sanitizeTopicKeyForFirestore(topicKey)
  const operations = []
  const now = serverTimestamp()

  // Flashcards do tópico
  const flashcardsSnap = await getDocs(collection(db, 'courses', resolvedId, 'flashcards'))
  flashcardsSnap.docs.forEach((d) => {
    const data = d.data()
    if (data.topicKey === topicKey) {
      operations.push({
        ref: doc(db, 'courses', resolvedId, 'flashcards', d.id),
        data: { status, updatedAt: now },
      })
    }
  })

  // Questões preditivas — níveis 1 a 10
  for (let nivel = 1; nivel <= 10; nivel++) {
    const questoesRef = doc(db, 'courses', resolvedId, 'questoesTopico', `${sanitizedKey}_nivel_${nivel}`)
    const questoesDoc = await getDoc(questoesRef)
    if (questoesDoc.exists()) {
      operations.push({
        ref: questoesRef,
        data: { status, topicKey, updatedAt: now },
      })
    }
  }

  // Questões legadas (doc id = topicKey ou sanitizedKey sem nível)
  for (const legacyId of [sanitizedKey, topicKey]) {
    if (!legacyId) continue
    const legacyRef = doc(db, 'courses', resolvedId, 'questoesTopico', legacyId)
    const legacyDoc = await getDoc(legacyRef)
    if (legacyDoc.exists()) {
      operations.push({
        ref: legacyRef,
        data: { status, topicKey, updatedAt: now },
      })
    }
  }

  // Conteúdo completo (material de apoio)
  const conteudoRef = doc(db, 'courses', resolvedId, 'conteudosCompletos', sanitizedKey)
  const conteudoDoc = await getDoc(conteudoRef)
  if (conteudoDoc.exists()) {
    operations.push({
      ref: conteudoRef,
      data: { status, topicKey, updatedAt: now },
    })
  }

  // Registro central de status (para UI do edital)
  operations.push({
    ref: doc(db, 'courses', resolvedId, 'topicoStatus', sanitizedKey),
    data: { topicKey, status, updatedAt: now },
  })

  if (operations.length === 1) {
    // Só topicoStatus — ainda assim salva para marcar intenção
    await commitBatches(operations)
    return { flashcards: 0, questoes: 0, conteudo: false }
  }

  await commitBatches(operations)

  const flashcardsCount = operations.filter((op) =>
    op.ref.path.includes('/flashcards/')
  ).length
  const questoesCount = operations.filter((op) =>
    op.ref.path.includes('/questoesTopico/')
  ).length
  const conteudoUpdated = conteudoDoc.exists()

  return { flashcards: flashcardsCount, questoes: questoesCount, conteudo: conteudoUpdated }
}

export function toggleTopicoPublishStatus(currentStatus) {
  return currentStatus === CONTENT_STATUS.AVAILABLE
    ? CONTENT_STATUS.UNAVAILABLE
    : CONTENT_STATUS.AVAILABLE
}
