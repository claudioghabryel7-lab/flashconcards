import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { GENERATION_JOB_STATUS } from './generationJobService'

/** Corrige painel do dia quando o job foi cancelado mas tópicos ficaram em "generating". */
export async function reconcileCancelledMentoradoDay(courseId, targetDate) {
  if (!courseId || !targetDate || !db) return false

  const ref = doc(db, 'courses', courseId, 'mentoradoAutomation', targetDate)
  const snap = await getDoc(ref)
  if (!snap.exists()) return false

  const data = snap.data()
  const hasStuckTopics = (data.topics || []).some((t) => t.status === 'generating')
  const dayStillRunning =
    data.status === 'running' ||
    data.status === 'waiting_api' ||
    data.status === 'waiting_retry' ||
    data.status === 'waiting_timeout'

  if (!hasStuckTopics && data.status === 'cancelled') return false
  if (!hasStuckTopics && !dayStillRunning) return false

  const topics = (data.topics || []).map((t) =>
    t.status === 'generating'
      ? { ...t, status: 'pending', step: 'aguardando', error: null }
      : t,
  )

  await updateDoc(ref, {
    status: 'cancelled',
    reason: 'Cancelado pelo admin',
    topics,
    updatedAt: serverTimestamp(),
  })
  return true
}

export function isMentoradoDayInactive(dayStatus, jobStatus) {
  if (dayStatus === 'cancelled') return true
  if (
    jobStatus === GENERATION_JOB_STATUS.CANCELLED ||
    jobStatus === GENERATION_JOB_STATUS.ERROR ||
    jobStatus === GENERATION_JOB_STATUS.DONE
  ) {
    return dayStatus !== 'running' && !String(dayStatus || '').startsWith('waiting')
  }
  return false
}

export function getEffectiveTopicDisplay(topic, dayInactive) {
  if (!dayInactive || topic.status !== 'generating') return topic
  return { ...topic, status: 'pending', step: 'aguardando' }
}
