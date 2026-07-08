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
import { sanitizeTopicKeyForFirestore, normalizeTopicKeyForStorage } from '../utils/topicKeyFirestore'
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
  return buildTopicoPublishMapFromSnapshot(snap)
}

export function buildTopicoPublishMapFromSnapshot(snapshot) {
  const map = {}
  snapshot.docs.forEach((d) => {
    const data = d.data()
    const status = data.status || CONTENT_STATUS.UNAVAILABLE
    if (data.topicKey) {
      map[data.topicKey] = status
    }
    map[d.id] = status
  })
  return map
}

export function resolveTopicPublishStatus(map, topicKey) {
  if (!topicKey || !map) return CONTENT_STATUS.UNAVAILABLE
  if (map[topicKey]) return map[topicKey]

  const sanitized = sanitizeTopicKeyForFirestore(topicKey)
  if (map[sanitized]) return map[sanitized]

  for (const [key, status] of Object.entries(map)) {
    if (topicKeysMatch(key, topicKey)) return status
  }

  return CONTENT_STATUS.UNAVAILABLE
}

/** Lê status de publicação do tópico no Firestore (topicoStatus). */
export async function fetchTopicoPublishStatus(courseId, topicKey) {
  if (!topicKey?.trim()) return CONTENT_STATUS.UNAVAILABLE
  const resolvedId = courseId || 'alego-default'
  const sanitizedKey = sanitizeTopicKeyForFirestore(normalizeTopicKeyForStorage(topicKey))
  const snap = await getDoc(doc(db, 'courses', resolvedId, 'topicoStatus', sanitizedKey))
  if (!snap.exists()) return CONTENT_STATUS.UNAVAILABLE
  return snap.data().status === CONTENT_STATUS.AVAILABLE
    ? CONTENT_STATUS.AVAILABLE
    : CONTENT_STATUS.UNAVAILABLE
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
  const normalizedTopicKey = normalizeTopicKeyForStorage(topicKey)
  const sanitizedKey = sanitizeTopicKeyForFirestore(normalizedTopicKey)
  const operations = []
  const now = serverTimestamp()

  // Flashcards — topicKey ou matéria/módulo
  const flashcardsSnap = await getDocs(collection(db, 'courses', resolvedId, 'flashcards'))
  flashcardsSnap.docs.forEach((d) => {
    const data = d.data()
    if (cardBelongsToTopic(data, normalizedTopicKey, disciplinaNome, moduloLabel)) {
      operations.push({
        ref: doc(db, 'courses', resolvedId, 'flashcards', d.id),
        data: { status, topicKey: normalizedTopicKey, updatedAt: now },
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
        data: { status, topicKey: normalizedTopicKey, updatedAt: now },
      })
    }
  }

  for (const legacyId of [sanitizedKey, normalizedTopicKey, topicKey, decodeURIComponentSafe(topicKey)]) {
    if (!legacyId) continue
    const legacyRef = doc(db, 'courses', resolvedId, 'questoesTopico', legacyId)
    const legacyDoc = await getDoc(legacyRef)
    if (legacyDoc.exists()) {
      operations.push({
        ref: legacyRef,
        data: { status, topicKey: normalizedTopicKey, updatedAt: now },
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

  // Incidência da disciplina — conteúdo de revisão + questões (níveis 1–10) + matéria revisada
  if (disciplinaNome) {
    const discKey = sanitizeDisciplinaName(disciplinaNome)
    const discNorm = disciplinaNome.toLowerCase().trim()

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

    const materiasSnap = await getDocs(collection(db, 'courses', resolvedId, 'materiasRevisadas'))
    materiasSnap.docs.forEach((d) => {
      const materia = (d.data().materia || '').toLowerCase().trim()
      if (materia && (materia === discNorm || materia.includes(discNorm) || discNorm.includes(materia))) {
        operations.push({
          ref: doc(db, 'courses', resolvedId, 'materiasRevisadas', d.id),
          data: { status, updatedAt: now },
        })
      }
    })
  }

  // Registro central (UI do edital)
  operations.push({
    ref: doc(db, 'courses', resolvedId, 'topicoStatus', sanitizedKey),
    data: { topicKey: normalizedTopicKey, status, disciplinaNome, updatedAt: now },
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
    materiasRevisadas: disciplinaNome
      ? operations.filter((op) => op.ref.path.includes('/materiasRevisadas/')).length
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

/** Libera ou bloqueia conteúdo de incidência, questões e matéria revisada de uma disciplina */
export async function setDisciplinaIncidenciaPublishStatus(courseId, disciplinaNome, status) {
  if (!disciplinaNome?.trim()) {
    throw new Error('Disciplina inválida')
  }

  const resolvedId = courseId || 'alego-default'
  const discKey = sanitizeDisciplinaName(disciplinaNome)
  const discNorm = disciplinaNome.toLowerCase().trim()
  const operations = []
  const now = serverTimestamp()

  const incidenciaRef = doc(db, 'courses', resolvedId, 'conteudosIncidencia', discKey)
  const incidenciaDoc = await getDoc(incidenciaRef)
  if (incidenciaDoc.exists()) {
    operations.push({ ref: incidenciaRef, data: { status, updatedAt: now } })
  }

  for (let nivel = 1; nivel <= 10; nivel++) {
    const qiRef = doc(db, 'courses', resolvedId, 'questoesIncidencia', `${discKey}_nivel_${nivel}`)
    const qiDoc = await getDoc(qiRef)
    if (qiDoc.exists()) {
      operations.push({ ref: qiRef, data: { status, updatedAt: now } })
    }
  }

  const materiasSnap = await getDocs(collection(db, 'courses', resolvedId, 'materiasRevisadas'))
  materiasSnap.docs.forEach((d) => {
    const materia = (d.data().materia || '').toLowerCase().trim()
    if (materia && (materia === discNorm || materia.includes(discNorm) || discNorm.includes(materia))) {
      operations.push({
        ref: doc(db, 'courses', resolvedId, 'materiasRevisadas', d.id),
        data: { status, updatedAt: now },
      })
    }
  })

  await commitBatches(operations)

  return {
    conteudoIncidencia: incidenciaDoc.exists(),
    questoesIncidencia: operations.filter((op) => op.ref.path.includes('/questoesIncidencia/')).length,
    materiasRevisadas: operations.filter((op) => op.ref.path.includes('/materiasRevisadas/')).length,
  }
}
