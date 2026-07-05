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
import { cardMatchesModule } from '../utils/editalVerticalizadoLoader'

const MAX_BATCH = 450

export function sanitizeDisciplinaName(nome = '') {
  return nome.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)
}

function topicKeysMatch(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  try {
    const da = decodeURIComponent(a)
    const db = decodeURIComponent(b)
    if (da === db || da === b || a === db) return true
  } catch {
    /* ignore */
  }
  return sanitizeTopicKeyForFirestore(a) === sanitizeTopicKeyForFirestore(b)
}

function cardBelongsToTopic(card, topicKey, disciplinaNome, moduloLabel) {
  if (topicKeysMatch(card.topicKey, topicKey)) return true
  if (disciplinaNome && moduloLabel && cardMatchesModule(card, disciplinaNome, moduloLabel)) {
    return true
  }
  return false
}

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
 * flashcards, questões preditivas, material de apoio e incidência da disciplina.
 */
export async function setTopicoPublishStatus(
  courseId,
  topicKey,
  status,
  { disciplinaNome = '', moduloLabel = '' } = {}
) {
  if (!topicKey?.trim()) {
    throw new Error('Tópico inválido')
  }

  const resolvedId = courseId || 'alego-default'
  const sanitizedKey = sanitizeTopicKeyForFirestore(topicKey)
  const operations = []
  const now = serverTimestamp()

  // Flashcards — topicKey ou matéria/módulo
  const flashcardsSnap = await getDocs(collection(db, 'courses', resolvedId, 'flashcards'))
  flashcardsSnap.docs.forEach((d) => {
    const data = d.data()
    if (cardBelongsToTopic(data, topicKey, disciplinaNome, moduloLabel)) {
      operations.push({
        ref: doc(db, 'courses', resolvedId, 'flashcards', d.id),
        data: { status, topicKey, updatedAt: now },
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

  for (const legacyId of [sanitizedKey, topicKey, decodeURIComponentSafe(topicKey)]) {
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

  // Material de apoio (Estudar)
  const conteudoRef = doc(db, 'courses', resolvedId, 'conteudosCompletos', sanitizedKey)
  const conteudoDoc = await getDoc(conteudoRef)
  if (conteudoDoc.exists()) {
    operations.push({
      ref: conteudoRef,
      data: { status, topicKey, updatedAt: now },
    })
  }

  // Incidência da disciplina — conteúdo + questões (níveis 1–10)
  if (disciplinaNome) {
    const discKey = sanitizeDisciplinaName(disciplinaNome)

    const incidenciaRef = doc(db, 'courses', resolvedId, 'conteudosIncidencia', discKey)
    const incidenciaDoc = await getDoc(incidenciaRef)
    if (incidenciaDoc.exists()) {
      operations.push({
        ref: incidenciaRef,
        data: { status, updatedAt: now },
      })
    }

    for (let nivel = 1; nivel <= 10; nivel++) {
      const qiRef = doc(db, 'courses', resolvedId, 'questoesIncidencia', `${discKey}_nivel_${nivel}`)
      const qiDoc = await getDoc(qiRef)
      if (qiDoc.exists()) {
        operations.push({
          ref: qiRef,
          data: { status, updatedAt: now },
        })
      }
    }
  }

  // Registro central (UI do edital)
  operations.push({
    ref: doc(db, 'courses', resolvedId, 'topicoStatus', sanitizedKey),
    data: { topicKey, status, disciplinaNome, updatedAt: now },
  })

  await commitBatches(operations)

  return {
    flashcards: operations.filter((op) => op.ref.path.includes('/flashcards/')).length,
    questoes: operations.filter((op) => op.ref.path.includes('/questoesTopico/')).length,
    conteudo: conteudoDoc.exists(),
    incidencia: disciplinaNome
      ? operations.filter(
          (op) =>
            op.ref.path.includes('/conteudosIncidencia/') ||
            op.ref.path.includes('/questoesIncidencia/')
        ).length
      : 0,
  }
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function toggleTopicoPublishStatus(currentStatus) {
  return currentStatus === CONTENT_STATUS.AVAILABLE
    ? CONTENT_STATUS.UNAVAILABLE
    : CONTENT_STATUS.AVAILABLE
}
