import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { buildFlagCorrectionLink } from '../utils/flagCorrectionLinks'

const ACTIVE_STATUSES = ['open', 'in_review', 'needs_admin']

function subscribeWithFallback(primaryQuery, fallbackQuery, mapDocs, onData, onError) {
  return onSnapshot(
    primaryQuery,
    (snap) => onData(mapDocs(snap)),
    (err) => {
      if (err.code === 'failed-precondition') {
        return onSnapshot(
          fallbackQuery,
          (snap) => {
            const rows = mapDocs(snap)
            rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
            onData(rows)
          },
          onError,
        )
      }
      onError?.(err)
    },
  )
}

function mapFlagDocs(snap) {
  return snap.docs.map((d) => {
    const data = d.data() || {}
    return {
      id: d.id,
      courseId: data.courseId || d.ref.parent.parent?.id || null,
      ...data,
    }
  })
}

export async function submitContentFlag({
  courseId,
  contentType,
  contentId,
  topicKey = null,
  text,
  user,
  profile,
  preview = '',
  disciplinaNome = '',
  topicoNome = '',
  moduloLabel = '',
}) {
  if (!courseId || !contentId || !user?.uid) {
    throw new Error('Dados insuficientes para sinalizar.')
  }

  const ref = collection(db, 'courses', courseId, 'contentFeedback')
  await addDoc(ref, {
    courseId,
    contentType,
    contentId: String(contentId),
    topicKey: topicKey || null,
    disciplinaNome: disciplinaNome || '',
    topicoNome: topicoNome || '',
    moduloLabel: moduloLabel || topicoNome || '',
    kind: 'flag',
    text: (text || '').trim() || 'Conteúdo sinalizado para revisão.',
    preview: preview ? String(preview).slice(0, 280) : '',
    userId: user.uid,
    userName:
      profile?.displayName ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'Usuário',
    status: 'open',
    clearedFromHistory: false,
    createdAt: serverTimestamp(),
  })
}

/** Flags ativas na Moderação: open + in_review + needs_admin */
export function subscribeActiveFlags(onData, onError) {
  const byId = new Map()

  const emit = () => {
    const rows = Array.from(byId.values()).sort(
      (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
    )
    onData(rows)
  }

  const unsubs = ACTIVE_STATUSES.map((status) =>
    subscribeWithFallback(
      query(
        collectionGroup(db, 'contentFeedback'),
        where('kind', '==', 'flag'),
        where('status', '==', status),
        orderBy('createdAt', 'desc'),
      ),
      query(
        collectionGroup(db, 'contentFeedback'),
        where('kind', '==', 'flag'),
        where('status', '==', status),
      ),
      mapFlagDocs,
      (rows) => {
        // Remove deste status e reinsere
        for (const [id, row] of byId.entries()) {
          if (row.status === status) byId.delete(id)
        }
        rows.forEach((r) => {
          if (!r.clearedFromHistory) byId.set(`${r.courseId}:${r.id}`, r)
        })
        emit()
      },
      onError,
    ),
  )

  return () => unsubs.forEach((u) => u?.())
}

/** Compat: só open (legado) */
export function subscribeOpenFlags(onData, onError) {
  return subscribeActiveFlags(onData, onError)
}

/** Histórico de resolvidas (não limpas) */
export function subscribeResolvedFlags(onData, onError) {
  return subscribeWithFallback(
    query(
      collectionGroup(db, 'contentFeedback'),
      where('kind', '==', 'flag'),
      where('status', '==', 'resolved'),
      orderBy('createdAt', 'desc'),
    ),
    query(
      collectionGroup(db, 'contentFeedback'),
      where('kind', '==', 'flag'),
      where('status', '==', 'resolved'),
    ),
    (snap) => mapFlagDocs(snap).filter((r) => !r.clearedFromHistory),
    onData,
    onError,
  )
}

/**
 * Resolve flag. Extra: contentCorrected, lastProfessorSummary, resolvedBy, etc.
 */
export async function resolveContentFlag(courseId, flagDocId, extra = {}) {
  const {
    contentCorrected,
    lastProfessorSummary,
    resolvedBy = 'admin',
    notifyUser = true,
    flagSnapshot = null,
  } = extra

  const flagRef = doc(db, 'courses', courseId, 'contentFeedback', flagDocId)
  const patch = {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
    resolvedBy,
    clearedFromHistory: false,
    updatedAt: serverTimestamp(),
  }
  if (typeof contentCorrected === 'boolean') patch.contentCorrected = contentCorrected
  if (lastProfessorSummary != null) patch.lastProfessorSummary = lastProfessorSummary

  await updateDoc(flagRef, patch)

  if (notifyUser) {
    try {
      let flag = flagSnapshot
      if (!flag) {
        const { getDoc } = await import('firebase/firestore')
        const snap = await getDoc(flagRef)
        flag = snap.exists() ? { id: snap.id, ...snap.data(), courseId } : null
      }
      if (flag?.userId) {
        await notifyFlagResolved(flag, {
          contentCorrected: patch.contentCorrected ?? flag.contentCorrected ?? false,
          summary: patch.lastProfessorSummary || flag.lastProfessorSummary || '',
        })
      }
    } catch (err) {
      console.warn('[flag] notificar aluno:', err?.message || err)
    }
  }
}

/** Notifica o aluno que sinalizou */
export async function notifyFlagResolved(flag, { contentCorrected = false, summary = '' } = {}) {
  if (!flag?.userId) return null
  const explanation =
    summary ||
    (contentCorrected
      ? 'O Professor IA corrigiu o conteúdo sinalizado.'
      : 'O Professor IA revisou e manteve o conteúdo (sem alteração necessária).')

  const linkPath = buildFlagCorrectionLink({
    courseId: flag.courseId,
    topicKey: flag.topicKey,
    contentType: flag.contentType,
    contentId: flag.contentId,
    disciplinaNome: flag.disciplinaNome,
    topicoNome: flag.topicoNome,
    moduloLabel: flag.moduloLabel,
    professorNote: explanation,
    flagId: flag.id,
  })

  const notifId = `flag_${flag.courseId}_${flag.id}`
  await setDoc(
    doc(db, 'users', flag.userId, 'notifications', notifId),
    {
      type: 'flag_resolved',
      tone: contentCorrected ? 'success' : 'cyan',
      title: contentCorrected ? 'Sinalização corrigida' : 'Sinalização revisada',
      message: explanation.slice(0, 400),
      explanation: explanation.slice(0, 800),
      contentCorrected: Boolean(contentCorrected),
      courseId: flag.courseId || null,
      contentType: flag.contentType || null,
      contentId: flag.contentId || null,
      topicKey: flag.topicKey || null,
      disciplinaNome: flag.disciplinaNome || '',
      topicoNome: flag.topicoNome || '',
      moduloLabel: flag.moduloLabel || '',
      flagId: flag.id,
      linkPath,
      href: linkPath,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return notifId
}

/** Limpa histórico (marca clearedFromHistory — some da lista) */
export async function clearResolvedFlagsHistory(flags = []) {
  const batchSize = 400
  let cleared = 0
  for (let i = 0; i < flags.length; i += batchSize) {
    const chunk = flags.slice(i, i + batchSize)
    const batch = writeBatch(db)
    chunk.forEach((f) => {
      if (!f.courseId || !f.id) return
      batch.update(doc(db, 'courses', f.courseId, 'contentFeedback', f.id), {
        clearedFromHistory: true,
        historyClearedAt: serverTimestamp(),
      })
      cleared += 1
    })
    await batch.commit()
  }
  return cleared
}

/** Apaga docs do histórico (opcional, destrutivo) */
export async function deleteResolvedFlagsHistory(flags = []) {
  let n = 0
  for (const f of flags) {
    if (!f.courseId || !f.id) continue
    await deleteDoc(doc(db, 'courses', f.courseId, 'contentFeedback', f.id))
    n += 1
  }
  return n
}

export async function reopenFlagForProfessor(courseId, flagId) {
  await updateDoc(doc(db, 'courses', courseId, 'contentFeedback', flagId), {
    status: 'open',
    inReviewBy: null,
    inReviewJobId: null,
    lastProfessorSummary: 'Reaberto manualmente na Moderação.',
    updatedAt: serverTimestamp(),
  })
}
