import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'

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

export function subscribeOpenFlags(onData, onError) {
  const mapDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))

  return subscribeWithFallback(
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
    onError,
  )
}

export async function resolveContentFlag(courseId, flagDocId) {
  await updateDoc(doc(db, 'courses', courseId, 'contentFeedback', flagDocId), {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
  })
}
