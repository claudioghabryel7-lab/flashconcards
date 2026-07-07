import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { assignChartColors, toChartItems } from '../utils/progressChartColors'
import { normalizeQuestoesStatsCourseKey } from '../utils/questoesStats'

const CHART_TOP_N = 8

const EMPTY_METRICS = {
  studyHoursByMateria: [],
  questoesAcertosByMateria: [],
  questoesErrosByMateria: [],
  flashcardsByMateria: [],
}

function sortDesc(items) {
  return [...items].sort((a, b) => b.value - a.value)
}

function sortAsc(items) {
  return [...items].sort((a, b) => a.value - b.value)
}

function pickMostStudied(items, limit = CHART_TOP_N) {
  const ranked = sortDesc(items)
  if (ranked.length <= limit) {
    const count = Math.max(1, Math.ceil(ranked.length / 2))
    return assignChartColors(ranked.slice(0, count))
  }
  return assignChartColors(ranked.slice(0, limit))
}

function pickLeastStudied(items, limit = CHART_TOP_N) {
  const ranked = sortAsc(items)
  if (ranked.length <= limit) {
    const count = Math.max(1, Math.floor(ranked.length / 2))
    return assignChartColors(ranked.slice(0, count))
  }
  return assignChartColors(ranked.slice(0, limit))
}

async function loadFlashcardsByMateria(userId, courseId) {
  const userProgressSnap = await getDoc(doc(db, 'userProgress', userId))
  const cardProgress = userProgressSnap.exists()
    ? userProgressSnap.data().cardProgress || {}
    : {}

  const cardsById = new Map()

  const courseCardsSnap = await getDocs(
    collection(db, 'courses', courseId, 'flashcards'),
  )
  courseCardsSnap.forEach((cardDoc) => {
    cardsById.set(cardDoc.id, { id: cardDoc.id, ...cardDoc.data() })
  })

  const globalCardsSnap = await getDocs(collection(db, 'flashcards'))
  globalCardsSnap.forEach((cardDoc) => {
    const data = cardDoc.data()
    const cardCourseId = data.courseId || null
    if (cardCourseId === courseId || cardCourseId === null) {
      cardsById.set(cardDoc.id, { id: cardDoc.id, ...data })
    }
  })

  const byMateria = {}
  cardsById.forEach((card) => {
    const materia = (card.disciplina || card.materia || '').trim()
    if (!materia) return
    const progress = cardProgress[card.id]
    if (!progress?.reviewCount) return
    byMateria[materia] = (byMateria[materia] || 0) + 1
  })

  return assignChartColors(sortDesc(toChartItems(byMateria)))
}

async function loadQuestoesStatsDoc(userId, courseId) {
  const courseKey = normalizeQuestoesStatsCourseKey(courseId)
  const primaryRef = doc(db, 'questoesStats', `${userId}_${courseKey}`)
  const primarySnap = await getDoc(primaryRef)
  if (primarySnap.exists()) return primarySnap

  if (courseKey !== 'alego') {
    const legacySnap = await getDoc(doc(db, 'questoesStats', `${userId}_alego`))
    if (legacySnap.exists()) return legacySnap
  }

  return primarySnap
}

async function loadQuestoesMetrics(userId, courseId) {
  const courseKey = normalizeQuestoesStatsCourseKey(courseId)
  const statsSnap = await loadQuestoesStatsDoc(userId, courseId)

  let byMateria = statsSnap.exists() ? statsSnap.data().byMateria || {} : {}

  if (Object.keys(byMateria).length === 0) {
    const desempenhoSnap = await getDocs(
      collection(db, 'users', userId, 'desempenhoTopico'),
    )
    const materiaStats = {}
    desempenhoSnap.forEach((docSnap) => {
      if (docSnap.id.includes('_nivel_')) return
      const data = docSnap.data()
      if (data.courseId && normalizeQuestoesStatsCourseKey(data.courseId) !== courseKey) return
      const materia = data.disciplina || data.materia || 'Geral'
      if (!materiaStats[materia]) {
        materiaStats[materia] = { correct: 0, wrong: 0 }
      }
      materiaStats[materia].correct += data.acertos || 0
      materiaStats[materia].wrong += data.erros || 0
    })
    byMateria = materiaStats
  }

  const acertos = pickMostStudied(
    toChartItems(
      Object.fromEntries(
        Object.entries(byMateria).map(([name, data]) => [name, data?.correct || 0]),
      ),
    ),
  )

  const erros = pickMostStudied(
    toChartItems(
      Object.fromEntries(
        Object.entries(byMateria).map(([name, data]) => [name, data?.wrong || 0]),
      ),
    ),
  )

  return { acertos, erros }
}

function buildStudyHours(progressDocs, studySessions) {
  const byMateria = {}

  progressDocs.forEach((item) => {
    if (!item.materia || !(item.hours > 0)) return
    byMateria[item.materia] = (byMateria[item.materia] || 0) + item.hours
  })

  studySessions.forEach((session) => {
    if (!session.materia || !(session.duration > 0)) return
    byMateria[session.materia] = (byMateria[session.materia] || 0) + session.duration
  })

  return assignChartColors(sortDesc(toChartItems(byMateria)))
}

export function useProgressMetrics(user, courseId) {
  const [metrics, setMetrics] = useState({ ...EMPTY_METRICS, loading: true })

  useEffect(() => {
    if (!user?.uid || !courseId) {
      setMetrics({ ...EMPTY_METRICS, loading: false })
      return () => {}
    }

    let cancelled = false

    const progressQuery = query(
      collection(db, 'progress'),
      where('uid', '==', user.uid),
    )

    const unsubscribe = onSnapshot(
      progressQuery,
      async (snapshot) => {
        const progressDocs = []
        snapshot.forEach((progressDoc) => {
          const data = progressDoc.data()
          if (data.date && data.courseId === courseId) {
            progressDocs.push(data)
          }
        })

        try {
          const sessionsSnap = await getDocs(
            collection(db, 'users', user.uid, 'studySessions'),
          )
          const studySessions = []
          sessionsSnap.forEach((sessionDoc) => {
            const data = sessionDoc.data()
            if (data.courseId && data.courseId !== courseId) return
            const start = data.startTime?.toDate?.()
            const end = data.endTime?.toDate?.()
            if (!start || !end) return
            studySessions.push({
              materia: data.materia,
              duration: (end - start) / 1000 / 60 / 60,
            })
          })

          const studyHoursByMateria = buildStudyHours(progressDocs, studySessions)
          const { acertos, erros } = await loadQuestoesMetrics(user.uid, courseId)
          const flashcardsByMateria = await loadFlashcardsByMateria(user.uid, courseId)

          if (!cancelled) {
            setMetrics({
              studyHoursByMateria,
              questoesAcertosByMateria: acertos,
              questoesErrosByMateria: erros,
              flashcardsByMateria,
              loading: false,
            })
          }
        } catch (error) {
          console.error('Erro ao carregar métricas de progresso:', error)
          if (!cancelled) {
            setMetrics({ ...EMPTY_METRICS, loading: false })
          }
        }
      },
      (error) => {
        console.error('Erro ao observar progresso:', error)
        if (!cancelled) {
          setMetrics({ ...EMPTY_METRICS, loading: false })
        }
      },
    )

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [user?.uid, courseId])

  return {
    ...metrics,
    maisEstudadas: pickMostStudied(metrics.studyHoursByMateria),
    menosEstudadas: pickLeastStudied(metrics.studyHoursByMateria),
  }
}
