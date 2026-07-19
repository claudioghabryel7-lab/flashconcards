import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  buildExamFidelityBlock,
  getBancaStyleGuide,
  inferDifficultyLevel,
  normalizeExamContext,
} from './examFidelityContext'

export { getBancaStyleGuide, inferDifficultyLevel }

export function buildCourseContextBlock(courseData = {}) {
  const exam = normalizeExamContext({
    banca: courseData.banca,
    cargo: courseData.cargo,
    concursoName: courseData.competition || courseData.concursoName || courseData.name,
    courseName: courseData.name || courseData.competition,
    nivel: courseData.nivel || courseData.escolaridade,
    area: courseData.area,
  })

  return `${buildExamFidelityBlock(exam)}
🚨 REGRAS JURÍDICAS (NÃO VIOLAR):
1. NUNCA cite artigo vetado, revogado ou projeto de lei como vigente.
2. NUNCA afirme suspensão de norma sem confirmar em fonte oficial (Planalto, STF, STJ).
3. Se não tiver certeza absoluta, escreva "verificar vigência" em vez de inventar.
4. Cite lei com número e ano reais (ex.: Lei nº 13.964/2019). Sem número inventado.
5. Juiz das Garantias e demais reformas: confirme status atual (vigente/suspenso/inconstitucional) antes de afirmar.
6. Adapte linguagem e formato ao estilo da banca ${exam.banca || 'do edital'} para o cargo ${exam.cargo || 'indicado'}.

`
}

const contextCache = new Map()

export async function fetchCourseAiContext(courseId) {
  if (!courseId) return null
  const resolvedId = courseId === 'alego-default' ? courseId : courseId
  if (contextCache.has(resolvedId)) return contextCache.get(resolvedId)

  try {
    const snap = await getDoc(doc(db, 'courses', resolvedId))
    if (!snap.exists()) return null
    const data = { id: snap.id, ...snap.data() }

    if (!data.banca || !data.cargo) {
      try {
        const unifiedSnap = await getDoc(doc(db, 'courses', resolvedId, 'prompts', 'unified'))
        if (unifiedSnap.exists()) {
          const unified = unifiedSnap.data()
          if (!data.banca && unified.banca) data.banca = unified.banca
          if (!data.competition && unified.concursoName) data.competition = unified.concursoName
          if (!data.cargo && unified.cargo) data.cargo = unified.cargo
        }
      } catch {
        // ignora fallback de prompts
      }
    }

    // Garante cargo a partir de competition quando ausente
    if (!data.cargo && data.competition) data.cargo = data.competition

    contextCache.set(resolvedId, data)
    return data
  } catch (err) {
    console.warn('fetchCourseAiContext:', err.message)
    return null
  }
}

export function buildPromptWithCourseContext(prompt, courseData) {
  if (!courseData) return prompt
  return `${buildCourseContextBlock(courseData)}${prompt}`
}
