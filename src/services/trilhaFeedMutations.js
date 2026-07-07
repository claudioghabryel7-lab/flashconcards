import { deleteDoc, doc, increment, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

export function buildFeedComment({ user, profile, text }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    authorId: user.uid,
    authorName: profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Aluno',
    authorPhotoBase64: profile?.photoBase64 || null,
    createdAt: new Date().toISOString(),
    likes: [],
    likesCount: 0,
    replies: [],
  }
}

export function buildFeedReply({ user, profile, text }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    authorId: user.uid,
    authorName: profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Aluno',
    authorPhotoBase64: profile?.photoBase64 || null,
    createdAt: new Date().toISOString(),
    likes: [],
    likesCount: 0,
  }
}

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
    commentsCount: countFeedComments(next),
  })
}

export async function toggleFeedCommentLike(postId, comments, commentId, userId) {
  if (!db || !postId || !userId) return
  const next = (comments || []).map((comment) => {
    if (comment.id !== commentId) return comment
    const likes = comment.likes || []
    const isLiked = likes.includes(userId)
    const likesCount = comment.likesCount ?? likes.length
    return {
      ...comment,
      likes: isLiked ? likes.filter((id) => id !== userId) : [...likes, userId],
      likesCount: isLiked ? Math.max(0, likesCount - 1) : likesCount + 1,
    }
  })
  await updateDoc(doc(db, 'trilhaFeed', postId), { comments: next })
}

export async function toggleFeedReplyLike(postId, comments, commentId, replyId, userId) {
  if (!db || !postId || !userId) return
  const next = (comments || []).map((comment) => {
    if (comment.id !== commentId) return comment
    const replies = (comment.replies || []).map((reply) => {
      if (reply.id !== replyId) return reply
      const likes = reply.likes || []
      const isLiked = likes.includes(userId)
      const likesCount = reply.likesCount ?? likes.length
      return {
        ...reply,
        likes: isLiked ? likes.filter((id) => id !== userId) : [...likes, userId],
        likesCount: isLiked ? Math.max(0, likesCount - 1) : likesCount + 1,
      }
    })
    return { ...comment, replies }
  })
  await updateDoc(doc(db, 'trilhaFeed', postId), { comments: next })
}

export async function addFeedCommentReply(postId, comments, commentId, reply) {
  if (!db || !postId || !commentId || !reply) return
  const next = (comments || []).map((comment) => {
    if (comment.id !== commentId) return comment
    return { ...comment, replies: [...(comment.replies || []), reply] }
  })
  await updateDoc(doc(db, 'trilhaFeed', postId), {
    comments: next,
    commentsCount: increment(1),
  })
}

export async function deleteFeedReply(postId, comments, commentId, replyId) {
  if (!db || !postId || !commentId || !replyId) return
  const next = (comments || []).map((comment) => {
    if (comment.id !== commentId) return comment
    return {
      ...comment,
      replies: (comment.replies || []).filter((reply) => reply.id !== replyId),
    }
  })
  await updateDoc(doc(db, 'trilhaFeed', postId), {
    comments: next,
    commentsCount: countFeedComments(next),
  })
}

export function countFeedComments(comments = []) {
  return comments.reduce((total, comment) => total + 1 + (comment.replies?.length || 0), 0)
}
