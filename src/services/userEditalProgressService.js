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
 * Mesma fonte do Edital Verticalizado (`userEditalProgress`).
 * Com os 3 marcados, também grava `editalProgress` (igual ao Edital).
 * @returns {{ progress: object, value: boolean, allDone: boolean }}
 */
export async function toggleTopicCheckin({
  uid,
  courseId,
  topicKey,
  campo,
  disciplinaNome = '',
  topicoNome = '',
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
  const nextEntry = { ...current, [campo]: value }
  progress[topicKey] = nextEntry

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

  const allDone = Boolean(nextEntry.flashcards && nextEntry.questoes && nextEntry.estudado)

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

  // Espelha o Edital: tópico 100% no dia → editalProgress
  if (allDone) {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      const progressKey = `${uid}_${courseId}_${today}_${topicKey}`
      await setDoc(
        doc(db, 'editalProgress', progressKey),
        {
          userId: uid,
          courseId,
          date: today,
          disciplina: disciplinaNome,
          topico: topicoNome || disciplinaNome,
          topicKey,
          flashcards: true,
          questoes: true,
          estudado: true,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: 'dashboard',
        },
        { merge: true },
      )
    } catch (editalErr) {
      console.warn('[check-in] editalProgress:', editalErr?.message || editalErr)
    }
  }

  return { progress, value, allDone }
}
