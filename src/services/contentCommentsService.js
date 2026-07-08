import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { sanitizeCommentForStorage } from '../utils/commentFormatUtils'
import { deleteProfilePostByFeedId } from './profilePostsService'
import { buildContentCommentSharePath } from '../utils/feedUtils'
import { publishContentCommentToFeed, buildContentItemPreview } from './trilhaFeedService'

function commentsRef(courseId) {
  return collection(db, 'courses', courseId || 'alego-default', 'contentComments')
}

function commentRef(courseId, commentId) {
  return doc(db, 'courses', courseId || 'alego-default', 'contentComments', commentId)
}

function voteRef(courseId, commentId, userId) {
  return doc(
    db,
    'courses',
    courseId || 'alego-default',
    'contentComments',
    commentId,
    'votes',
    userId,
  )
}

function mapCommentDoc(d) {
  const courseId = d.data().courseId || d.ref.parent?.parent?.id || null
  return {
    id: d.id,
    courseId,
    _docPath: d.ref.path,
    ...d.data(),
  }
}

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

export async function addContentComment({
  courseId,
  contentType,
  contentId,
  topicKey = null,
  text,
  preview = '',
  materia = '',
  assunto = '',
  user,
  profile,
}) {
  if (!courseId || !contentId || !user?.uid) {
    throw new Error('Dados insuficientes para comentar.')
  }

  const trimmed = sanitizeCommentForStorage(text)
  if (!trimmed) throw new Error('Escreva um comentário antes de enviar.')

  const previewText = preview ? String(preview).slice(0, 500) : ''

  const docRef = await addDoc(commentsRef(courseId), {
    courseId,
    contentType,
    contentId: String(contentId),
    topicKey: topicKey || null,
    text: trimmed,
    preview: previewText.slice(0, 280),
    materia: materia || '',
    assunto: assunto || '',
    userId: user.uid,
    userName:
      profile?.displayName ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'Usuário',
    userPhotoBase64: profile?.photoBase64 || null,
    likes: 0,
    dislikes: 0,
    createdAt: serverTimestamp(),
    editedAt: null,
    feedPostId: null,
  })

  let feedPostId = null
  let feedWarning = null

  try {
    const shareUrl = buildContentCommentSharePath({ courseId, contentType, topicKey })
    feedPostId = await publishContentCommentToFeed({
      user,
      profile,
      data: {
        courseId,
        topicKey,
        contentType,
        contentId: String(contentId),
        contentCommentId: docRef.id,
        commentText: trimmed,
        contentPreview: previewText,
        materia,
        assunto,
        shareUrl,
        modalidade:
          contentType === 'questao'
            ? 'questoes'
            : contentType === 'incidencia'
              ? 'revisao'
              : 'flashcards',
        itemPreview: buildContentItemPreview(contentType, previewText),
      },
    })

    if (feedPostId) {
      try {
        await updateDoc(docRef, { feedPostId })
      } catch (linkError) {
        console.warn('Comentário publicado no feed, mas link feedPostId falhou:', linkError)
      }
    } else {
      feedWarning = 'Comentário salvo, mas não apareceu no feed da comunidade.'
    }
  } catch (error) {
    console.error('Erro ao publicar comentário no feed:', error)
    feedWarning = 'Comentário salvo no seu perfil. Não foi possível publicar na comunidade agora.'
  }

  return { commentId: docRef.id, feedPostId, feedWarning }
}

export async function updateContentComment({ courseId, commentId, text, userId, isAdmin = false }) {
  const ref = commentRef(courseId, commentId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Comentário não encontrado.')

  const data = snap.data()
  if (!isAdmin && data.userId !== userId) {
    throw new Error('Você só pode editar seus próprios comentários.')
  }

  const trimmed = sanitizeCommentForStorage(text)
  if (!trimmed) throw new Error('O comentário não pode ficar vazio.')

  await updateDoc(ref, {
    text: trimmed,
    editedAt: serverTimestamp(),
  })

  if (data.feedPostId) {
    try {
      await updateDoc(doc(db, 'trilhaFeed', data.feedPostId), {
        commentText: trimmed,
        contentPreview: data.preview || trimmed.slice(0, 500),
      })
    } catch (error) {
      console.warn('Não foi possível atualizar post no feed:', error)
    }
  }
}

export async function deleteContentComment({ courseId, commentId, userId, isAdmin = false }) {
  const ref = commentRef(courseId, commentId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data = snap.data()
  if (!isAdmin && data.userId !== userId) {
    throw new Error('Você só pode apagar seus próprios comentários.')
  }

  if (data.feedPostId) {
    try {
      await deleteDoc(doc(db, 'trilhaFeed', data.feedPostId))
    } catch (error) {
      console.warn('Não foi possível apagar post do feed:', error)
    }
    try {
      await deleteProfilePostByFeedId(data.userId, data.feedPostId)
    } catch (error) {
      console.warn('Não foi possível apagar post do perfil:', error)
    }
  }

  await deleteDoc(ref)
}

function sortCommentsByLikesDesc(rows) {
  return [...rows].sort((a, b) => {
    const likeDiff = (b.likes || 0) - (a.likes || 0)
    if (likeDiff !== 0) return likeDiff
    return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
  })
}

export function subscribeContentComments(
  { courseId, contentType, contentId, alternateContentIds = [] },
  onData,
  onError,
) {
  const mapDocs = (snap) => sortCommentsByLikesDesc(snap.docs.map(mapCommentDoc))
  const ids = [...new Set([String(contentId), ...alternateContentIds.map(String)].filter(Boolean))]

  const buildQuery = (useOrder) => {
    const filters = [
      where('contentType', '==', contentType),
      ids.length === 1 ? where('contentId', '==', ids[0]) : where('contentId', 'in', ids.slice(0, 10)),
    ]
    if (useOrder) filters.push(orderBy('createdAt', 'desc'))
    return query(commentsRef(courseId), ...filters)
  }

  const fallbackQuery = () => {
    const filters = [
      where('contentType', '==', contentType),
      ids.length === 1 ? where('contentId', '==', ids[0]) : where('contentId', 'in', ids.slice(0, 10)),
    ]
    return query(commentsRef(courseId), ...filters)
  }

  return onSnapshot(
    buildQuery(true),
    (snap) => onData(mapDocs(snap)),
    (err) => {
      if (err.code === 'failed-precondition') {
        return onSnapshot(fallbackQuery(), (snap) => onData(mapDocs(snap)), onError)
      }
      onError?.(err)
    },
  )
}

export function subscribeUserComments(userId, onData, onError) {
  if (!userId) return () => {}

  const mapDocs = (snap) => snap.docs.map(mapCommentDoc)

  return subscribeWithFallback(
    query(collectionGroup(db, 'contentComments'), where('userId', '==', userId), orderBy('createdAt', 'desc')),
    query(collectionGroup(db, 'contentComments'), where('userId', '==', userId)),
    mapDocs,
    onData,
    onError,
  )
}

export async function voteContentComment({ courseId, commentId, userId, voteType }) {
  const cRef = commentRef(courseId, commentId)
  const vRef = voteRef(courseId, commentId, userId)

  await runTransaction(db, async (tx) => {
    const commentSnap = await tx.get(cRef)
    if (!commentSnap.exists()) throw new Error('Comentário não encontrado.')

    const voteSnap = await tx.get(vRef)
    const prev = voteSnap.exists() ? voteSnap.data().vote : null
    let likes = commentSnap.data().likes || 0
    let dislikes = commentSnap.data().dislikes || 0

    if (prev === voteType) {
      if (voteType === 'like') likes = Math.max(0, likes - 1)
      else dislikes = Math.max(0, dislikes - 1)
      tx.delete(vRef)
    } else {
      if (prev === 'like') likes = Math.max(0, likes - 1)
      if (prev === 'dislike') dislikes = Math.max(0, dislikes - 1)
      if (voteType === 'like') likes += 1
      else dislikes += 1
      tx.set(vRef, { vote: voteType, updatedAt: serverTimestamp() })
    }

    tx.update(cRef, { likes, dislikes })
  })
}

export async function getUserVoteOnComment(courseId, commentId, userId) {
  if (!userId) return null
  const snap = await getDoc(voteRef(courseId, commentId, userId))
  return snap.exists() ? snap.data().vote : null
}

/** Republica comentários antigos que não têm post no feed (só do usuário logado). */
export async function backfillUserCommentsToFeed({ user, profile, comments = [] }) {
  if (!user?.uid || !comments.length) return { published: 0, failed: 0 }

  let published = 0
  let failed = 0

  for (const comment of comments) {
    if (comment.feedPostId || comment.userId !== user.uid) continue
    try {
      const shareUrl = buildContentCommentSharePath({
        courseId: comment.courseId,
        contentType: comment.contentType,
        topicKey: comment.topicKey,
      })
      const feedPostId = await publishContentCommentToFeed({
        user,
        profile,
        data: {
          courseId: comment.courseId,
          topicKey: comment.topicKey,
          contentType: comment.contentType,
          contentId: comment.contentId,
          contentCommentId: comment.id,
          commentText: comment.text,
          contentPreview: comment.preview || comment.text?.slice(0, 500),
          materia: comment.materia,
          assunto: comment.assunto,
          shareUrl,
          modalidade:
            comment.contentType === 'questao'
              ? 'questoes'
              : comment.contentType === 'incidencia'
                ? 'revisao'
                : 'flashcards',
          itemPreview: buildContentItemPreview(
            comment.contentType,
            comment.preview || comment.text?.slice(0, 500),
          ),
        },
      })
      if (feedPostId && comment.courseId) {
        await updateDoc(commentRef(comment.courseId, comment.id), { feedPostId })
        published += 1
      } else {
        failed += 1
      }
    } catch {
      failed += 1
    }
  }

  return { published, failed }
}
