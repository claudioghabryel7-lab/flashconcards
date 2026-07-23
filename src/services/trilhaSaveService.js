import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../firebase/config'
import { publishTrilhaActivity } from './trilhaFeedService'
import { firestoreErrorMessage, stripUndefined, toFirestoreDate } from '../utils/firestoreHelpers'
import {
  saveTrilhaManualEntry,
  saveTrilhaSession,
} from './trilhaStorage'

async function mirrorStudySession(userId, payload) {
  if (!userId || !db) return

  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - (payload.durationMinutes || 0) * 60 * 1000)

  await addDoc(
    collection(db, 'users', userId, 'studySessions'),
    stripUndefined({
      userId,
      materia: payload.materia || 'Geral',
      modalidade: payload.modalidade || 'teoria',
      assunto: payload.assunto || '',
      startTime: toFirestoreDate(startDate),
      endTime: toFirestoreDate(endDate),
      isActive: false,
      source: payload.source || 'trilha',
      durationMinutes: payload.durationMinutes || 0,
      createdAt: serverTimestamp(),
    }),
  )
}

async function incrementDailyProgress(userId, courseId, hours, materia) {
  if (!userId || !hours || !db) return

  const todayKey = dayjs().format('YYYY-MM-DD')
  const courseKey = courseId || 'alego'
  const progressRef = doc(db, 'progress', `${userId}_${courseKey}_${todayKey}`)
  const currentDoc = await getDoc(progressRef)
  const prev = currentDoc.exists() ? currentDoc.data() : {}
  const currentHours = prev.hours || 0
  const materiasSet = new Set(
    Array.isArray(prev.materias) ? prev.materias.filter(Boolean) : []
  )
  if (prev.materia) materiasSet.add(prev.materia)
  if (materia) materiasSet.add(materia)
  const materias = [...materiasSet]

  await setDoc(
    progressRef,
    stripUndefined({
      uid: userId,
      date: todayKey,
      hours: currentHours + hours,
      courseId: courseId ?? null,
      materia: materia || prev.materia || null,
      materias,
      lastUpdated: dayjs().format('HH:mm:ss'),
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  )
}

async function runSecondarySaves({ user, profile, courseId, payload }) {
  const results = await Promise.allSettled([
    mirrorStudySession(user.uid, payload),
    incrementDailyProgress(user.uid, courseId, payload.durationMinutes / 60, payload.materia),
    publishTrilhaActivity({ user, profile, payload: { ...payload, courseId } }),
  ])

  const failed = results.filter((r) => r.status === 'rejected')
  if (failed.length) {
    console.warn('Trilha: etapas secundárias falharam:', failed.map((r) => r.reason))
  }

  return failed.length === 0
}

export async function saveTimerSession({
  user,
  profile,
  courseId,
  timerForm,
  durationMinutes,
  elapsedSeconds,
}) {
  if (!db) throw new Error('Firebase não inicializado.')
  if (!user?.uid) throw new Error('Usuário não autenticado.')

  const materia = timerForm.materia?.trim()
  if (!materia) throw new Error('Informe a matéria antes de salvar.')

  const sessionData = stripUndefined({
    materia,
    assunto: timerForm.assunto?.trim() || '',
    modalidade: timerForm.modalidade || 'teoria',
    durationMinutes,
    elapsedSeconds,
    courseId: courseId ?? null,
    source: 'timer',
    createdAt: serverTimestamp(),
  })

  await saveTrilhaSession(user.uid, sessionData)

  const payload = {
    materia,
    assunto: sessionData.assunto,
    modalidade: sessionData.modalidade,
    durationMinutes,
    source: 'timer',
  }

  await runSecondarySaves({ user, profile, courseId, payload })
}

export async function saveManualEntry({ user, profile, courseId, manualForm }) {
  if (!db) throw new Error('Firebase não inicializado.')
  if (!user?.uid) throw new Error('Usuário não autenticado.')

  const materia = manualForm.materia?.trim()
  const minutos = Number(manualForm.minutos)
  if (!materia) throw new Error('Informe a matéria antes de salvar.')
  if (!minutos || minutos <= 0) throw new Error('Informe os minutos estudados.')

  const entryData = stripUndefined({
    materia,
    assunto: manualForm.assunto?.trim() || '',
    modalidade: manualForm.modalidade || 'teoria',
    minutos,
    acertos: manualForm.acertos ?? null,
    erros: manualForm.erros ?? null,
    courseId: courseId ?? null,
    source: 'manual',
    createdAt: serverTimestamp(),
  })

  await saveTrilhaManualEntry(user.uid, entryData)

  const payload = {
    materia,
    assunto: entryData.assunto,
    modalidade: entryData.modalidade,
    durationMinutes: minutos,
    acertos: entryData.acertos,
    erros: entryData.erros,
    source: 'manual',
  }

  await runSecondarySaves({ user, profile, courseId, payload })
}

export { firestoreErrorMessage }
