import {
  collection,
  doc,
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
    .sort((a, b) => String(a.name || a.competition || a.id).localeCompare(String(b.name || b.competition || b.id)))
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
