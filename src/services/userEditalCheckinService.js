import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../firebase/config'
import { makeTopicKey } from '../utils/editalVerticalizadoLoader'
import { normalizeTopicKeyForStorage } from '../utils/topicKeyFirestore'

const CHECKIN_FIELDS = ['flashcards', 'questoes', 'estudado']

/** Chave usada no Edital Verticalizado (encoded). */
export function editalProgressTopicKey({ topicoNumero = '', topicoNome = '', topicKey = '' } = {}) {
  if (topicoNumero || topicoNome) {
    return makeTopicKey({ numero: topicoNumero, nome: topicoNome })
  }
  const normalized = normalizeTopicKeyForStorage(topicKey)
  if (!normalized) return ''
  if (normalized.includes(' :: ')) {
    const [numero, ...rest] = normalized.split(' :: ')
    return makeTopicKey({ numero: numero.trim(), nome: rest.join(' :: ').trim() })
  }
  return makeTopicKey({ numero: '', nome: normalized })
}

export async function loadUserEditalProgress(userId, courseId) {
  if (!userId || !courseId) return {}
  const ref = doc(db, 'userEditalProgress', userId, 'courses', courseId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return {}
  return snap.data()?.progress || {}
}

export function getTopicCheckins(progressMap = {}, topicMeta = {}) {
  const key = editalProgressTopicKey(topicMeta)
  const entry = progressMap?.[key] || {}
  return {
    topicKey: key,
    flashcards: !!entry.flashcards,
    questoes: !!entry.questoes,
    estudado: !!entry.estudado,
    doneCount: CHECKIN_FIELDS.filter((f) => !!entry[f]).length,
    allDone: CHECKIN_FIELDS.every((f) => !!entry[f]),
  }
}

/**
 * Alterna check-in do aluno (mesma gravação do Edital Verticalizado).
 * campo: 'flashcards' | 'questoes' | 'estudado'
 */
export async function toggleUserEditalCheckin({
  userId,
  courseId,
  topicMeta = {},
  campo,
  value,
  disciplinaNome = '',
} = {}) {
  if (!userId || !courseId) throw new Error('Usuário ou curso inválido')
  if (!CHECKIN_FIELDS.includes(campo)) throw new Error('Campo de check-in inválido')

  const topicKey = editalProgressTopicKey(topicMeta)
  if (!topicKey) throw new Error('Tópico inválido')

  const userProgressRef = doc(db, 'userEditalProgress', userId, 'courses', courseId)
  const snap = await getDoc(userProgressRef)
  const progressData = snap.exists() ? { ...(snap.data()?.progress || {}) } : {}
  const current = { ...(progressData[topicKey] || {}) }
  const novoValor = typeof value === 'boolean' ? value : !current[campo]
  current[campo] = novoValor
  progressData[topicKey] = current

  await setDoc(
    userProgressRef,
    {
      userId,
      courseId,
      progress: progressData,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  if (campo === 'estudado' && novoValor && disciplinaNome) {
    await registerCalendarMateria(userId, courseId, disciplinaNome).catch(() => {})
  }

  const allDone = CHECKIN_FIELDS.every((f) => !!current[f])
  if (allDone) {
    await registerEditalDayCompletion({
      userId,
      courseId,
      topicKey,
      disciplinaNome,
      topicoNome: topicMeta.topicoNome || topicMeta.nome || '',
    }).catch(() => {})
  }

  return {
    topicKey,
    progress: progressData,
    checkins: getTopicCheckins(progressData, topicMeta),
    novoValor,
  }
}

async function registerCalendarMateria(userId, courseId, materia) {
  const today = new Date().toISOString().split('T')[0]
  const progressDoc = doc(db, 'progress', `${userId}_${courseId}_${today}`)
  const existing = await getDoc(progressDoc)
  if (existing.exists()) {
    await setDoc(
      progressDoc,
      {
        ...existing.data(),
        materia,
        lastUpdated: new Date().toTimeString(),
      },
      { merge: true },
    )
    return
  }
  await setDoc(progressDoc, {
    uid: userId,
    date: today,
    hours: 0.1,
    courseId: courseId || null,
    materia,
    lastUpdated: new Date().toTimeString(),
  })
}

async function registerEditalDayCompletion({
  userId,
  courseId,
  topicKey,
  disciplinaNome,
  topicoNome,
}) {
  const today = dayjs().format('YYYY-MM-DD')
  const progressKey = `${userId}_${courseId}_${today}_${topicKey}`
  await setDoc(
    doc(db, 'editalProgress', progressKey),
    {
      userId,
      courseId,
      date: today,
      disciplina: disciplinaNome || '',
      topico: topicoNome || '',
      topicKey,
      flashcards: true,
      questoes: true,
      estudado: true,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
