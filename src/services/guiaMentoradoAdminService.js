import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  buildMentoradoConfigWrite,
  formatDailyReleaseLabel,
  normalizeMentoradoAutomationConfig,
} from '../utils/guiaMentoradoAutomationConfig'
import {
  startGuiaMentoradoCronogramaGeneration,
  startMentoradoDayContentAutomation,
} from './guiaMentoradoAutomationService'
import {
  startMentoradoBackfillAllCourses,
  startMentoradoBackfillForCourse,
} from './adminPlatformService'
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'

export { formatDailyReleaseLabel, normalizeMentoradoAutomationConfig }

export function subscribeGuiaMentoradoConfig(courseId, onData) {
  if (!db || !courseId) return () => {}
  const ref = doc(db, 'courses', courseId, 'config', 'guiaMentorado')
  return onSnapshot(
    ref,
    (snap) => {
      onData(normalizeMentoradoAutomationConfig(snap.exists() ? snap.data() : {}), snap)
    },
    () => onData(normalizeMentoradoAutomationConfig({}), null),
  )
}

export async function listActiveCoursesForAdmin() {
  if (!db) return []
  const snap = await getDocs(collection(db, 'courses'))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.active !== false)
    .sort((a, b) =>
      String(a.name || a.competition || a.id).localeCompare(
        String(b.name || b.competition || b.id),
      ),
    )
}

/**
 * Salva planejamento + automação unificada (espelha campos legados).
 */
export async function saveGuiaMentoradoAdminConfig(courseId, form, { userId, existing } = {}) {
  if (!db || !courseId) throw new Error('Curso não selecionado.')
  if (!userId) throw new Error('Usuário não autenticado.')

  const payload = buildMentoradoConfigWrite(form, { userId, existing })
  await setDoc(
    doc(db, 'courses', courseId, 'config', 'guiaMentorado'),
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return normalizeMentoradoAutomationConfig(payload)
}

/**
 * Aplica a mesma configuração (planejamento + agenda + gatilhos) a todos os cursos ativos.
 * Preserva lastDailyRun* de cada curso.
 */
export async function applyGuiaMentoradoConfigToAllCourses(form, { userId, onProgress } = {}) {
  if (!userId) throw new Error('Usuário não autenticado.')
  const courses = await listActiveCoursesForAdmin()
  if (!courses.length) throw new Error('Nenhum curso ativo encontrado.')

  let ok = 0
  const errors = []

  for (const course of courses) {
    const label = course.name || course.competition || course.id
    try {
      onProgress?.(`Aplicando em ${label}… (${ok + 1}/${courses.length})`)
      const snap = await getDoc(doc(db, 'courses', course.id, 'config', 'guiaMentorado'))
      const existing = snap.exists() ? snap.data() : {}
      await saveGuiaMentoradoAdminConfig(course.id, form, { userId, existing })
      ok += 1
    } catch (err) {
      errors.push({
        courseId: course.id,
        name: label,
        message: err.message || String(err),
      })
    }
  }

  return { count: ok, total: courses.length, errors }
}

export async function runMentoradoCronograma({ userId, courseId, config }) {
  return startGuiaMentoradoCronogramaGeneration({
    userId,
    courseId,
    config: {
      dataProva: config.dataProva,
      hasTAF: config.hasTAF,
      tafExercicios: config.tafExercicios,
      hasRedacao: config.hasRedacao,
      autoGerarConteudo: config.enabled,
      automation: {
        enabled: config.enabled,
        automationUserId: userId,
        schedule: config.schedule,
        triggers: config.triggers,
        vespera: config.vespera,
      },
      automationUserId: userId,
    },
  })
}

export async function runMentoradoToday({ userId, courseId, targetDate }) {
  const editalVerticalizado = await loadEditalVerticalizado(courseId)
  if (!editalVerticalizado?.disciplinas?.length) {
    throw new Error('Edital verticalizado não encontrado. Gere o edital primeiro.')
  }
  return startMentoradoDayContentAutomation({
    userId,
    courseId,
    targetDate,
    editalVerticalizado,
  })
}

export async function runMentoradoBackfill({ userId, courseId, courseName }) {
  const editalVerticalizado = await loadEditalVerticalizado(courseId)
  return startMentoradoBackfillForCourse({
    userId,
    courseId,
    courseName,
    editalVerticalizado,
  })
}

export async function runMentoradoBackfillAllCourses(userId, onProgress) {
  return startMentoradoBackfillAllCourses(userId, onProgress)
}
