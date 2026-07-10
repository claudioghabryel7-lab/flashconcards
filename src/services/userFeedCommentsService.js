import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'

function extractUserCommentsFromPosts(posts, userId) {
  const rows = []

  posts.forEach((post) => {
    if (post.postType === 'comentario' && post.authorId === userId) {
      rows.push({
        id: `post-${post.id}`,
        _docPath: `trilhaFeed/${post.id}`,
        text: post.questionText || post.text || post.caption || '',
        preview: post.contentPreview || post.preview || '',
        contentType: 'comunidade',
        createdAt: post.createdAt,
        likes: 0,
        dislikes: 0,
        feedPostId: post.id,
      })
    }

    ;(post.comments || []).forEach((comment) => {
      if (comment.authorId === userId) {
        rows.push({
          id: `feed-${post.id}-${comment.id}`,
          _docPath: `trilhaFeed/${post.id}/comments/${comment.id}`,
          text: comment.text || '',
          preview: post.questionText || post.caption || post.text || 'Publicação da comunidade',
          contentType: 'comunidade',
          createdAt: comment.createdAt,
          likes: comment.likes?.length || comment.likeCount || 0,
          dislikes: comment.dislikes?.length || comment.dislikeCount || 0,
          feedPostId: post.id,
        })
      }

      ;(comment.replies || []).forEach((reply) => {
        if (reply.authorId === userId) {
          rows.push({
            id: `feed-${post.id}-${comment.id}-${reply.id}`,
            _docPath: `trilhaFeed/${post.id}/comments/${comment.id}/replies/${reply.id}`,
            text: reply.text || '',
            preview: comment.text || 'Resposta em publicação',
            contentType: 'comunidade',
            createdAt: reply.createdAt,
            likes: reply.likes?.length || reply.likeCount || 0,
            dislikes: reply.dislikes?.length || reply.dislikeCount || 0,
            feedPostId: post.id,
          })
        }
      })
    })
  })

  rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
  return rows
}

/** Comentários do usuário em publicações da comunidade (trilhaFeed). */
export function subscribeUserFeedComments(userId, onData, onError) {
  if (!userId || !db) return () => {}

  const postsRef = collection(db, 'trilhaFeed')
  let unsub = () => {}

  const subscribe = (useOrder = true) => {
    const q = useOrder ? query(postsRef, orderBy('createdAt', 'desc')) : query(postsRef)
    unsub = onSnapshot(
      q,
      (snap) => {
        const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        onData(extractUserCommentsFromPosts(posts, userId))
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
