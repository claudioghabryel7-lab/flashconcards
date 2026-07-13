import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'

function mapFlagDoc(d) {
  const data = d.data() || {}
  // courseId pode faltar no doc antigo — deriva do path courses/{id}/contentFeedback/{id}
  const courseIdFromPath = d.ref?.parent?.parent?.id || null
  return {
    id: d.id,
    ...data,
    courseId: data.courseId || courseIdFromPath,
  }
}

function subscribeWithFallback(primaryQuery, fallbackQuery, mapDocs, onData, onError) {
  return onSnapshot(
    primaryQuery,
    (snap) => onData(mapDocs(snap)),
    (err) => {
      console.warn('[contentFeedback] query primária falhou:', err?.code || err?.message)
      if (err.code === 'failed-precondition' || err.code === 'permission-denied') {
        return onSnapshot(
          fallbackQuery,
          (snap) => {
            const rows = mapDocs(snap)
            rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
            onData(rows)
          },
          (err2) => {
            console.error('[contentFeedback] fallback falhou:', err2)
            onError?.(err2)
          },
        )
      }
      onError?.(err)
    },
  )
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
    createdAt: serverTimestamp(),
  })
}

/**
 * Admin: lista sinalizações abertas.
 * Preferência: collectionGroup; se falhar, varre cursos ativos.
 */
export function subscribeOpenFlags(onData, onError) {
  const mapDocs = (snap) => snap.docs.map(mapFlagDoc)

  const unsubPrimary = subscribeWithFallback(
    query(
      collectionGroup(db, 'contentFeedback'),
      where('kind', '==', 'flag'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
    ),
    query(
      collectionGroup(db, 'contentFeedback'),
      where('kind', '==', 'flag'),
      where('status', '==', 'open'),
    ),
    mapDocs,
    onData,
    async (err) => {
      // Último recurso: varrer cursos
      try {
        const coursesSnap = await getDocs(collection(db, 'courses'))
        const all = []
        await Promise.all(
          coursesSnap.docs.map(async (courseDoc) => {
            const q = query(
              collection(db, 'courses', courseDoc.id, 'contentFeedback'),
              where('kind', '==', 'flag'),
              where('status', '==', 'open'),
            )
            const snap = await getDocs(q)
            snap.docs.forEach((d) => all.push(mapFlagDoc(d)))
          }),
        )
        all.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        onData(all)
      } catch (scanErr) {
        console.error('[contentFeedback] scan por curso falhou:', scanErr)
        onError?.(err || scanErr)
      }
    },
  )

  return unsubPrimary
}

export async function resolveContentFlag(courseId, flagDocId) {
  const flagRef = doc(db, 'courses', courseId, 'contentFeedback', flagDocId)
  const snap = await getDoc(flagRef)
  const flagData = snap.exists() ? snap.data() : {}

  await updateDoc(flagRef, {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
    resolvedBy: 'admin',
  })

  if (flagData.userId) {
    const typeLabel =
      flagData.contentType === 'flashcard'
        ? 'flashcard'
        : flagData.contentType === 'questao'
          ? 'questão'
          : flagData.contentType || 'conteúdo'
    await addDoc(collection(db, 'users', flagData.userId, 'notifications'), {
      type: 'flag_corrected',
      tone: 'success',
      title: 'Sinalização corrigida',
      message: `Seu relatório sobre ${typeLabel} foi revisado e o conteúdo foi corrigido.`,
      courseId,
      contentType: flagData.contentType || null,
      contentId: flagData.contentId || null,
      topicKey: flagData.topicKey || null,
      flagId: flagDocId,
      preview: flagData.preview || '',
      read: false,
      createdAt: serverTimestamp(),
    })
  }
}

export async function deleteContentFlag(courseId, flagDocId) {
  await deleteDoc(doc(db, 'courses', courseId, 'contentFeedback', flagDocId))
}
