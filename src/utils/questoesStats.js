import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

export function normalizeQuestoesStatsCourseKey(courseId) {
  if (!courseId || courseId === 'alego') return 'alego-default'
  return courseId
}

/**
 * Incrementa estatísticas globais de questões por matéria (Firestore: questoesStats)
 */
export async function incrementQuestoesStats(userId, courseId, materia, acertos, erros) {
  if (!userId || !materia) return

  const courseKey = normalizeQuestoesStatsCourseKey(courseId)
  const statsRef = doc(db, 'questoesStats', `${userId}_${courseKey}`)
  const snap = await getDoc(statsRef)
  const prev = snap.exists() ? snap.data() : { correct: 0, wrong: 0, byMateria: {} }

  const byMateria = { ...(prev.byMateria || {}) }
  if (!byMateria[materia]) {
    byMateria[materia] = { correct: 0, wrong: 0 }
  }
  byMateria[materia].correct += acertos
  byMateria[materia].wrong += erros

  await setDoc(
    statsRef,
    {
      uid: userId,
      courseId: courseId || null,
      correct: (prev.correct || 0) + acertos,
      wrong: (prev.wrong || 0) + erros,
      byMateria,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

export function byMateriaToChartData(byMateria = {}) {
  return Object.entries(byMateria)
    .map(([name, data]) => {
      const correct = data?.correct || 0
      const wrong = data?.wrong || 0
      const total = correct + wrong
      return {
        name,
        value: total,
        acertos: correct,
        erros: wrong,
        aproveitamento: total > 0 ? Math.round((correct / total) * 100) : 0,
      }
    })
    .filter((m) => m.value > 0)
    .sort((a, b) => b.value - a.value)
}
