import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Gera um token temporário para compartilhamento de flashcards e salva no Firestore
 * @param {Object} data - { courseId, disciplina, modulo, topicKey }
 * @returns {string} Token gerado
 */
export async function generateShareToken(data) {
  // Gerar um token único
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  
  const payload = {
    ...data,
    active: true,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
    accessCount: 0,
  }
  
  // Salvar no Firestore
  await setDoc(doc(db, 'sharedFlashcards', token), payload)
  
  return token
}
