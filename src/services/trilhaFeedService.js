import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { Timestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../firebase/config'
import { stripUndefined } from '../utils/firestoreHelpers'
import { getDefaultCardTheme } from '../utils/feedUtils'
import { feedExpiresAtTimestamp, normalizeDurationMinutes } from '../utils/feedTimeUtils'
import { archiveProfilePost } from './profilePostsService'

const MAX_PHOTO_BYTES = 120_000

export const FEED_POST_TYPES = {
  TRILHA: 'trilha',
  FLASHCARDS: 'flashcards',
  QUESTOES: 'questoes',
  MATERIAL: 'material',
  COMENTARIO: 'comentario',
  DUVIDA: 'duvida',
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

export function buildContentItemPreview(contentType, previewText = '') {
  const text = previewText ? String(previewText).slice(0, 500) : ''
  const type = contentType === 'questao' ? 'questao' : contentType === 'incidencia' ? 'incidencia' : 'flashcard'
  const preview = { type, text }
  if (type === 'questao') preview.enunciado = text
  else preview.pergunta = text
  return preview
}

/**
 * Publica comentário de flashcard/questão no feed — sempre, independente de shareTrilhaToFeed.
 */
export async function publishContentCommentToFeed({ user, profile, data }) {
  if (!user?.uid || !db || !data) return null

  const postType = FEED_POST_TYPES.COMENTARIO
  const modalidade = data.modalidade || (data.contentType === 'questao' ? 'questoes' : 'flashcards')
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
      contentType: data.contentType || null,
      contentId: data.contentId || null,
      contentCommentId: data.contentCommentId || null,
      commentText: data.commentText || null,
      contentPreview: data.contentPreview || null,
      shareUrl: data.shareUrl || null,
      itemPreview: data.itemPreview || null,
      source: 'comentario',
      cardTheme: data.cardTheme || theme,
      featuredDate: dayjs().format('YYYY-MM-DD'),
      expiresAt: Timestamp.fromDate(feedExpiresAtTimestamp()),
      likes: [],
      likesCount: 0,
      comments: [],
      commentsCount: 0,
      createdAt: serverTimestamp(),
    }),
  )

  try {
    await archiveProfilePost(user.uid, {
      postType,
      materia: data.materia || '',
      assunto: data.assunto || '',
      modalidade,
      courseId: data.courseId ?? null,
      contentType: data.contentType || null,
      commentText: data.commentText || null,
      contentPreview: data.contentPreview || null,
      cardTheme: data.cardTheme || theme,
      featuredDate: dayjs().format('YYYY-MM-DD'),
      createdAt: serverTimestamp(),
    }, docRef.id)
  } catch (error) {
    console.warn('Não foi possível arquivar publicação no perfil:', error)
  }

  return docRef.id
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

  const durationMinutes = normalizeDurationMinutes(data.durationMinutes || data.minutos || 0)

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
      durationMinutes,
      acertos: data.acertos ?? null,
      erros: data.erros ?? null,
      cardTheme: data.cardTheme || theme,
      featuredDate: dayjs().format('YYYY-MM-DD'),
      expiresAt: Timestamp.fromDate(feedExpiresAtTimestamp()),
      likes: [],
      likesCount: 0,
      comments: [],
      commentsCount: 0,
      createdAt: serverTimestamp(),
    }),
  )

  try {
    await archiveProfilePost(user.uid, {
      postType,
      materia: data.materia || '',
      assunto: data.assunto || '',
      modalidade,
      courseId: data.courseId ?? null,
      durationMinutes,
      cardTheme: data.cardTheme || theme,
      featuredDate: dayjs().format('YYYY-MM-DD'),
      createdAt: serverTimestamp(),
    }, docRef.id)
  } catch (error) {
    console.warn('Não foi possível arquivar publicação no perfil:', error)
  }

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

/** Publicação livre na comunidade — dúvidas com texto e mídia opcional. */
export async function publishCommunityQuestion({ user, profile, data }) {
  if (!user?.uid || !db || !data?.questionText?.trim()) return null

  const postType = FEED_POST_TYPES.DUVIDA
  const theme = getDefaultCardTheme('teoria')

  const docRef = await addDoc(
    collection(db, 'trilhaFeed'),
    stripUndefined({
      postType,
      authorId: user.uid,
      authorName: authorNameFrom(user, profile),
      authorPhotoBase64: safePhoto(profile?.photoBase64),
      questionText: data.questionText.trim(),
      mediaType: data.mediaType || null,
      mediaBase64: data.mediaBase64 || null,
      mediaMimeType: data.mediaMimeType || null,
      modalidade: 'duvida',
      source: 'comunidade',
      cardTheme: data.cardTheme || theme,
      featuredDate: dayjs().format('YYYY-MM-DD'),
      expiresAt: Timestamp.fromDate(feedExpiresAtTimestamp()),
      likes: [],
      likesCount: 0,
      comments: [],
      commentsCount: 0,
      createdAt: serverTimestamp(),
    }),
  )

  try {
    await archiveProfilePost(
      user.uid,
      {
        postType,
        questionText: data.questionText.trim(),
        modalidade: 'duvida',
        cardTheme: data.cardTheme || theme,
        featuredDate: dayjs().format('YYYY-MM-DD'),
        createdAt: serverTimestamp(),
      },
      docRef.id,
    )
  } catch (error) {
    console.warn('Não foi possível arquivar publicação no perfil:', error)
  }

  return docRef.id
}
