import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { makeTopicKey } from '../utils/editalVerticalizadoLoader'
import { normalizeTopicKeyForStorage } from '../utils/topicKeyFirestore'

function progressRef(uid, courseId) {
  return doc(db, 'userEditalProgress', uid, 'courses', courseId)
}

/** Chave usada no Edital (makeTopicKey = URI-encoded). */
export function topicProgressKey({ topicoNumero = '', topicoNome = '', topicKey = '' } = {}) {
  if (topicoNumero || topicoNome) {
    return makeTopicKey({ numero: topicoNumero, nome: topicoNome })
  }
  if (!topicKey) return ''
  const decoded = normalizeTopicKeyForStorage(topicKey)
  const parts = decoded.split('::').map((s) => s.trim())
  if (parts.length >= 2) {
    return makeTopicKey({ numero: parts[0], nome: parts.slice(1).join(' :: ') })
  }
  return makeTopicKey({ numero: '', nome: decoded })
}

export async function loadUserEditalProgress(uid, courseId) {
  if (!uid || !courseId) return {}
  const snap = await getDoc(progressRef(uid, courseId))
  if (!snap.exists()) return {}
  return snap.data()?.progress || {}
}

export function getTopicCheckin(progressMap = {}, key = '') {
  if (!key) return { flashcards: false, questoes: false, estudado: false }
  const decoded = normalizeTopicKeyForStorage(key)
  const entry = progressMap[key] || progressMap[decoded] || {}
  return {
    flashcards: Boolean(entry.flashcards),
    questoes: Boolean(entry.questoes),
    estudado: Boolean(entry.estudado),
  }
}

/**
 * Alterna flashcards | questoes | estudado no progresso do usuário.
 * @returns {{ progress: object, value: boolean }}
 */
export async function toggleTopicCheckin({
  uid,
  courseId,
  topicKey,
  campo,
  disciplinaNome = '',
}) {
  if (!uid || !courseId || !topicKey) {
    throw new Error('Dados insuficientes para check-in.')
  }
  if (!['flashcards', 'questoes', 'estudado'].includes(campo)) {
    throw new Error('Campo de check-in inválido.')
  }

  const ref = progressRef(uid, courseId)
  const snap = await getDoc(ref)
  const progress = { ...(snap.exists() ? snap.data()?.progress || {} : {}) }
  const current = progress[topicKey] || {}
  const value = !Boolean(current[campo])
  progress[topicKey] = { ...current, [campo]: value }

  await setDoc(
    ref,
    {
      userId: uid,
      courseId,
      progress,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  if (campo === 'estudado' && value && disciplinaNome) {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      const calRef = doc(db, 'progress', `${uid}_${courseId}_${today}`)
      const existing = await getDoc(calRef)
      if (existing.exists()) {
        await setDoc(
          calRef,
          {
            ...existing.data(),
            materia: disciplinaNome,
            lastUpdated: new Date().toTimeString(),
          },
          { merge: true },
        )
      } else {
        await setDoc(calRef, {
          uid,
          date: today,
          hours: 0.1,
          courseId,
          materia: disciplinaNome,
          lastUpdated: new Date().toTimeString(),
        })
      }
    } catch (calErr) {
      console.warn('[check-in] calendário:', calErr?.message || calErr)
    }
  }

  return { progress, value }
}
