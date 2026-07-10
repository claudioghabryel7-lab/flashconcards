import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase/config'

const CONFIG_PATH = ['config', 'professorFiscalizador']
const SESSION_HOURS = 8

export function subscribeProfessorSupervisorConfig(onData) {
  if (!db) return () => {}
  const ref = doc(db, ...CONFIG_PATH)
  return onSnapshot(ref, (snap) => {
    onData(snap.exists() ? snap.data() : { enabled: false })
  })
}

export async function setProfessorSupervisorEnabled(userId, enabled) {
  if (!db || !userId) throw new Error('Não autenticado.')
  const ref = doc(db, ...CONFIG_PATH)

  if (enabled) {
    const now = Date.now()
    const sessionEndsAt = Timestamp.fromDate(new Date(now + SESSION_HOURS * 60 * 60 * 1000))
    await setDoc(
      ref,
      {
        enabled: true,
        automationUserId: userId,
        sessionStartedAt: serverTimestamp(),
        sessionEndsAt,
        nextRunAt: serverTimestamp(),
        phase: 'starting',
        itemsProcessedSession: 0,
        currentActivity: {
          phase: 'starting',
          message: 'Iniciando sessão — primeiro item em instantes…',
          updatedAt: serverTimestamp(),
        },
        lastMessage: 'Sessão iniciada — fiscalizando em instantes…',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    return
  }

  await setDoc(
    ref,
    {
      enabled: false,
      automationUserId: null,
      phase: 'idle',
      currentActivity: {
        phase: 'idle',
        message: 'Desativado pelo admin',
        updatedAt: serverTimestamp(),
      },
      lastMessage: 'Professor fiscalizador desativado.',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export function subscribePendingSupervisorReviews(onData, { max = 40 } = {}) {
  if (!db) return () => {}
  const q = query(
    collection(db, 'professorSupervisorReviews'),
    where('status', '==', 'pending_admin'),
    orderBy('createdAt', 'desc'),
    limit(max),
  )
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('Erro ao observar revisões do fiscalizador:', err),
  )
}

export async function rollbackSupervisorPatches(courseId, patches = []) {
  if (!db || !courseId || !patches.length) return

  for (const patch of patches) {
    if (patch.materialIndex != null) {
      const ref = doc(db, 'courses', courseId, 'vesperaDeProva', 'material')
      const snap = await getDoc(ref)
      if (!snap.exists()) continue
      const material = [...(snap.data().material || [])]
      const idx = patch.materialIndex
      if (material[idx] && patch.before?.resumo != null) {
        const resumos = [...(material[idx].revisaoTurbo?.resumos || [])]
        if (resumos.length) resumos[0] = patch.before.resumo
        material[idx] = {
          ...material[idx],
          revisaoTurbo: { ...material[idx].revisaoTurbo, resumos },
        }
        await setDoc(ref, { material, updatedAt: serverTimestamp() }, { merge: true })
      }
      continue
    }

    const { collection: coll, docId, before } = patch
    if (!coll || !docId || !before) continue
    await setDoc(
      doc(db, 'courses', courseId, coll, docId),
      { ...before, supervisorReviewed: false, updatedAt: serverTimestamp() },
      { merge: true },
    )
  }
}

export async function resolveSupervisorReview(reviewId, action = 'approved') {
  if (!db || !reviewId) return

  const reviewRef = doc(db, 'professorSupervisorReviews', reviewId)
  const snap = await getDoc(reviewRef)
  if (!snap.exists()) return

  const review = snap.data()
  if (action === 'rejected' && review.patches?.length) {
    await rollbackSupervisorPatches(review.courseId, review.patches)
  }

  await updateDoc(reviewRef, {
    status: action === 'rejected' ? 'rejected' : 'approved',
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function approveAllSupervisorReviews(reviews = []) {
  if (!db || !reviews.length) return { approved: 0 }

  const batch = writeBatch(db)
  let count = 0

  for (const review of reviews) {
    if (review.status !== 'pending_admin') continue
    batch.update(doc(db, 'professorSupervisorReviews', review.id), {
      status: 'approved',
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    count += 1
  }

  if (count > 0) await batch.commit()
  return { approved: count }
}

export async function fetchSupervisorHistory({ max = 30 } = {}) {
  if (!db) return []
  const q = query(
    collection(db, 'professorSupervisorHistory'),
    orderBy('createdAt', 'desc'),
    limit(max),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const SUPERVISOR_PHASE_LABELS = {
  idle: 'Ocioso',
  starting: 'Iniciando…',
  running: 'Fiscalizando agora',
  waiting_next: 'Aguardando próximo item',
  waiting_api: 'Aguardando API',
  building_queue: 'Montando fila',
  session_expired: 'Sessão encerrada (8h)',
}

export const PROFESSOR_STEP_LABELS = {
  iniciando: 'Preparando',
  digitacao: 'Professor de digitação (script)',
  professor_1: 'Professor 1 — fiscalizando',
  professor_2: 'Professor 2 — revisando',
  professor_3: 'Professor 3 — veredito',
  processando: 'Processando',
}
