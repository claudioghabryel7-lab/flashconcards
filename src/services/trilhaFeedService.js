import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../firebase/config'
import { stripUndefined } from '../utils/firestoreHelpers'
import { getDefaultCardTheme } from '../utils/feedUtils'

const MAX_PHOTO_BYTES = 120_000

export const FEED_POST_TYPES = {
  TRILHA: 'trilha',
  FLASHCARDS: 'flashcards',
  QUESTOES: 'questoes',
  MATERIAL: 'material',
  COMENTARIO: 'comentario',
}

function safePhoto(photoBase64) {
  if (!photoBase64 || typeof photoBase64 !== 'string') return null
  if (photoBase64.length > MAX_PHOTO_BYTES) return null
  return photoBase64
}

function authorNameFrom(user, profile) {
  return profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Aluno'
}

function defaultModalidade(postType) {
  if (postType === FEED_POST_TYPES.FLASHCARDS) return 'flashcards'
  if (postType === FEED_POST_TYPES.QUESTOES) return 'questoes'
  if (postType === FEED_POST_TYPES.MATERIAL) return 'teoria'
  return 'teoria'
}

/**
 * Publica qualquer tipo de conteúdo no feed da comunidade.
 */
export async function publishFeedPost({ user, profile, data }) {
  if (!user?.uid || !db || !data) return null
  if (profile?.shareTrilhaToFeed === false) return null

  const postType = data.postType || FEED_POST_TYPES.TRILHA
  const modalidade = data.modalidade || defaultModalidade(postType)
  const theme = getDefaultCardTheme(modalidade)

  const docRef = await addDoc(
    collection(db, 'trilhaFeed'),
    stripUndefined({
      postType,
      authorId: user.uid,
      authorName: authorNameFrom(user, profile),
      authorPhotoBase64: safePhoto(profile?.photoBase64),
      materia: data.materia || '',
      assunto: data.assunto || '',
      modalidade,
      courseId: data.courseId ?? null,
      topicKey: data.topicKey || null,
      shareToken: data.shareToken || null,
      shareId: data.shareId || null,
      shareUrl: data.shareUrl || null,
      itemCount: data.itemCount ?? null,
      itemIndex: data.itemIndex ?? null,
      itemPreview: data.itemPreview || null,
      contentType: data.contentType || null,
      contentId: data.contentId || null,
      contentCommentId: data.contentCommentId || null,
      commentText: data.commentText || null,
      source: data.source || postType,
      durationMinutes: data.durationMinutes || data.minutos || 0,
      acertos: data.acertos ?? null,
      erros: data.erros ?? null,
      cardTheme: data.cardTheme || theme,
      featuredDate: dayjs().format('YYYY-MM-DD'),
      likes: [],
      likesCount: 0,
      comments: [],
      commentsCount: 0,
      createdAt: serverTimestamp(),
    }),
  )

  return docRef.id
}

/** Compat: sessões da Trilha */
export async function publishTrilhaActivity({ user, profile, payload }) {
  return publishFeedPost({
    user,
    profile,
    data: {
      ...payload,
      postType: FEED_POST_TYPES.TRILHA,
      source: payload.source || 'manual',
    },
  })
}
