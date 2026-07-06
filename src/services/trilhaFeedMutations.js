import { deleteDoc, doc, increment, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

export async function deleteFeedPost(postId) {
  if (!db || !postId) return
  await deleteDoc(doc(db, 'trilhaFeed', postId))
}

export async function updateFeedPostTheme(postId, cardTheme) {
  if (!db || !postId || !cardTheme) return
  await updateDoc(doc(db, 'trilhaFeed', postId), {
    cardTheme: {
      color: cardTheme.color,
      font: cardTheme.font,
    },
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteFeedComment(postId, comments, commentId) {
  if (!db || !postId || !commentId) return
  const next = (comments || []).filter((c) => c.id !== commentId)
  await updateDoc(doc(db, 'trilhaFeed', postId), {
    comments: next,
    commentsCount: next.length,
  })
}
