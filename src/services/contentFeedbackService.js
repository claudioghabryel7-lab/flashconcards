import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * @param {'comment'|'flag'} kind
 */
export async function submitContentFeedback({
  courseId,
  contentType,
  contentId,
  topicKey = null,
  kind,
  text,
  user,
  profile,
  preview = '',
}) {
  if (!courseId || !contentId || !user?.uid) {
    throw new Error('Dados insuficientes para enviar feedback.')
  }

  const trimmed = (text || '').trim()
  if (kind === 'comment' && !trimmed) {
    throw new Error('Escreva um comentário antes de enviar.')
  }

  const ref = collection(db, 'courses', courseId, 'contentFeedback')
  await addDoc(ref, {
    contentType,
    contentId: String(contentId),
    topicKey: topicKey || null,
    kind,
    text: trimmed || (kind === 'flag' ? 'Conteúdo sinalizado para revisão.' : ''),
    preview: preview ? String(preview).slice(0, 280) : '',
    userId: user.uid,
    userName:
      profile?.displayName ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'Usuário',
    status: kind === 'flag' ? 'open' : 'published',
    createdAt: serverTimestamp(),
  })
}
