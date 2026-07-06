import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

function buildFlashcardPayload(pergunta, resposta) {
  return {
    pergunta,
    resposta,
    frente: pergunta,
    verso: resposta,
    updatedAt: serverTimestamp(),
  }
}

export async function saveFlashcardContent({ courseId, cardId, pergunta, resposta }) {
  const resolvedCourseId = courseId || 'alego-default'
  const courseRef = doc(db, 'courses', resolvedCourseId, 'flashcards', cardId)
  const globalRef = doc(db, 'flashcards', cardId)
  const payload = buildFlashcardPayload(pergunta, resposta)

  const [courseSnap, globalSnap] = await Promise.all([getDoc(courseRef), getDoc(globalRef)])

  if (courseSnap.exists()) {
    await setDoc(courseRef, payload, { merge: true })
    return
  }

  if (globalSnap.exists()) {
    await updateDoc(globalRef, payload)
    return
  }

  await setDoc(courseRef, { ...payload, courseId: resolvedCourseId }, { merge: true })
}

export async function deleteFlashcardContent({ courseId, cardId }) {
  const resolvedCourseId = courseId || 'alego-default'
  const courseRef = doc(db, 'courses', resolvedCourseId, 'flashcards', cardId)
  const globalRef = doc(db, 'flashcards', cardId)

  const [courseSnap, globalSnap] = await Promise.all([getDoc(courseRef), getDoc(globalRef)])

  if (courseSnap.exists()) {
    await deleteDoc(courseRef)
    return
  }

  if (globalSnap.exists()) {
    await deleteDoc(globalRef)
  }
}
