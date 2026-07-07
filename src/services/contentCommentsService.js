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
import { publishFeedPost } from './trilhaFeedService'

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

  const docRef = await addDoc(commentsRef(courseId), {
    courseId,
    contentType,
    contentId: String(contentId),
    topicKey: topicKey || null,
    text: trimmed,
    preview: preview ? String(preview).slice(0, 280) : '',
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

  if (profile?.shareTrilhaToFeed !== false) {
    try {
      const feedPostId = await publishFeedPost({
        user,
        profile,
        data: {
          postType: 'comentario',
          courseId,
          topicKey,
          contentType,
          contentId: String(contentId),
          contentCommentId: docRef.id,
          commentText: trimmed,
          materia,
          assunto,
          modalidade: contentType === 'questao' ? 'questoes' : 'flashcards',
          itemPreview: {
            type: contentType === 'questao' ? 'questao' : 'flashcard',
            enunciado: contentType === 'questao' ? String(preview).slice(0, 280) : undefined,
            pergunta: contentType === 'flashcard' ? String(preview).slice(0, 280) : undefined,
            text: String(preview).slice(0, 280),
          },
        },
      })
      if (feedPostId) {
        await updateDoc(docRef, { feedPostId })
      }
    } catch (error) {
      console.warn('Não foi possível publicar comentário no feed:', error)
    }
  }

  return docRef.id
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

  await deleteDoc(ref)
}

export function subscribeContentComments({ courseId, contentType, contentId }, onData, onError) {
  const mapDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))

  return subscribeWithFallback(
    query(
      commentsRef(courseId),
      where('contentType', '==', contentType),
      where('contentId', '==', String(contentId)),
      orderBy('createdAt', 'desc'),
    ),
    query(
      commentsRef(courseId),
      where('contentType', '==', contentType),
      where('contentId', '==', String(contentId)),
    ),
    mapDocs,
    onData,
    onError,
  )
}

export function subscribeUserComments(userId, onData, onError) {
  if (!userId) return () => {}

  const mapDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))

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
