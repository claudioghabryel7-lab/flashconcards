import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../firebase/config'
import { stripUndefined } from '../utils/firestoreHelpers'

const MAX_PHOTO_BYTES = 120_000

function safePhoto(photoBase64) {
  if (!photoBase64 || typeof photoBase64 !== 'string') return null
  if (photoBase64.length > MAX_PHOTO_BYTES) return null
  return photoBase64
}

export async function publishTrilhaActivity({ user, profile, payload }) {
  if (!user?.uid || !db) return null
  if (profile?.shareTrilhaToFeed === false) return null

  const authorName =
    profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Aluno'

  const docRef = await addDoc(
    collection(db, 'trilhaFeed'),
    stripUndefined({
      authorId: user.uid,
      authorName,
      authorPhotoBase64: safePhoto(profile?.photoBase64),
      source: payload.source || 'manual',
      materia: payload.materia || '',
      assunto: payload.assunto || '',
      modalidade: payload.modalidade || 'teoria',
      durationMinutes: payload.durationMinutes || payload.minutos || 0,
      acertos: payload.acertos ?? null,
      erros: payload.erros ?? null,
      courseId: payload.courseId ?? null,
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
