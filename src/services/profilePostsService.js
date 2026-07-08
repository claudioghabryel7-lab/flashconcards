import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { stripUndefined } from '../utils/firestoreHelpers'

function profilePostsRef(userId) {
  return collection(db, 'users', userId, 'profilePosts')
}

/** Arquiva publicação no perfil (permanente, independente do feed efêmero). */
export async function archiveProfilePost(userId, postData, feedPostId = null) {
  if (!userId || !db) return null

  const ref = await addDoc(
    profilePostsRef(userId),
    stripUndefined({
      ...postData,
      feedPostId,
      authorId: userId,
      archivedAt: serverTimestamp(),
      createdAt: postData.createdAt || serverTimestamp(),
    }),
  )
  return ref.id
}

export async function deleteProfilePostByFeedId(userId, feedPostId) {
  if (!userId || !feedPostId || !db) return
  const q = query(profilePostsRef(userId), where('feedPostId', '==', feedPostId))
  const snap = await getDocs(q)
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}

export function subscribeProfilePosts(userId, onData, onError) {
  if (!userId || !db) return () => {}

  let unsub = () => {}
  const subscribe = (useOrder = true) => {
    const q = useOrder
      ? query(profilePostsRef(userId), orderBy('createdAt', 'desc'))
      : query(profilePostsRef(userId))

    unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        rows.sort((a, b) => getPostTimestamp(b.createdAt) - getPostTimestamp(a.createdAt))
        onData(rows)
      },
      (err) => {
        if (err.code === 'failed-precondition' && useOrder) subscribe(false)
        else onError?.(err)
      },
    )
  }

  subscribe(true)
  return () => unsub()
}

function getPostTimestamp(ts) {
  if (!ts) return 0
  const date = ts?.toDate?.() || (ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts))
  const ms = date.getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/** Converte post arquivado para formato compatível com FeedPostThumbnail. */
export function profilePostToFeedShape(post) {
  return {
    ...post,
    id: post.feedPostId || post.id,
    profilePostId: post.id,
  }
}
