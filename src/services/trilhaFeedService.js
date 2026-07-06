import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../firebase/config'

export async function publishTrilhaActivity({ user, profile, payload }) {
  if (!user?.uid) return null
  if (profile?.shareTrilhaToFeed === false) return null

  const authorName =
    profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Aluno'

  const docRef = await addDoc(collection(db, 'trilhaFeed'), {
    authorId: user.uid,
    authorName,
    authorPhotoBase64: profile?.photoBase64 || null,
    source: payload.source || 'manual',
    materia: payload.materia || '',
    assunto: payload.assunto || '',
    modalidade: payload.modalidade || 'teoria',
    durationMinutes: payload.durationMinutes || payload.minutos || 0,
    acertos: payload.acertos ?? null,
    erros: payload.erros ?? null,
    courseId: payload.courseId || null,
    featuredDate: dayjs().format('YYYY-MM-DD'),
    likes: [],
    likesCount: 0,
    comments: [],
    commentsCount: 0,
    createdAt: serverTimestamp(),
  })

  return docRef.id
}
