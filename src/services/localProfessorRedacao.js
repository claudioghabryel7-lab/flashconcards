/**
 * Professor IA — rotação semanal de tema de redação (aba admin online).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { generateAiJson } from '../utils/geminiApi'
import { notifyCourseStudentsNewRedacaoTheme } from './redacaoStudentService'

const REDACAO_ROTATE_MS = 7 * 24 * 60 * 60 * 1000

async function shouldRotateCourse(courseId) {
  const guiaSnap = await getDoc(doc(db, 'courses', courseId, 'config', 'guiaMentorado'))
  const hasRedacao =
    guiaSnap.exists() &&
    (guiaSnap.data()?.hasRedacao === true ||
      guiaSnap.data()?.automation?.hasRedacao === true)
  if (!hasRedacao) return { ok: false, reason: 'no_redacao' }

  const redacaoSnap = await getDoc(doc(db, 'courses', courseId, 'config', 'redacao'))
  const data = redacaoSnap.exists() ? redacaoSnap.data() || {} : {}
  const tema = String(data.tema || '').trim()
  const last =
    data.rotatedAt?.toDate?.() ||
    data.temaRotatedAt?.toDate?.() ||
    data.updatedAt?.toDate?.() ||
    null

  if (!tema) return { ok: true, currentTema: '', reason: 'missing_theme' }
  if (!last || Date.now() - last.getTime() >= REDACAO_ROTATE_MS) {
    return { ok: true, currentTema: tema, reason: 'rotate_due' }
  }
  return { ok: false, currentTema: tema, reason: 'fresh' }
}

async function rotateThemeForCourse(courseId) {
  const courseSnap = await getDoc(doc(db, 'courses', courseId))
  const course = courseSnap.exists() ? courseSnap.data() || {} : {}
  const banca = String(course.banca || '').trim() || 'banca do concurso'
  const cargo = String(course.competition || '').trim()
  const concurso = cargo || String(course.name || courseId).trim()

  const redacaoSnap = await getDoc(doc(db, 'courses', courseId, 'config', 'redacao'))
  const temaAtual = redacaoSnap.exists() ? String(redacaoSnap.data()?.tema || '').trim() : ''

  const prompt = `Você é professor de redação para concursos públicos.

BANCA EXAMINADORA (use EXATAMENTE esta): ${banca}
CARGO: ${cargo || concurso}
CONCURSO: ${concurso}
TEMA ATUAL (não repetir se possível): ${temaAtual || '(nenhum)'}

TAREFA ÚNICA:
1) Proponha UM tema de redação dissertativa-argumentativa com alta probabilidade de cair nesta banca para este cargo.
2) Opcionalmente, um guia curto (guiaNota1000) para redação nota máxima.

PROIBIDO: inventar flashcards, material ou questões.

Retorne APENAS JSON:
{
  "tema": "texto do tema",
  "guiaNota1000": "dicas curtas (pode ser vazio)",
  "summary": "1 frase"
}`

  const parsed = await generateAiJson(prompt, {
    courseId,
    trustedGeneration: false,
    useGoogleSearch: true,
    thinkingLevel: 'minimal',
    // Tema + guia curto — 16k era desperdício
    generationConfig: { maxOutputTokens: 2048, temperature: 0.55 },
  })

  const tema = String(parsed?.tema || '').trim()
  if (!tema) throw new Error('IA não retornou tema de redação.')

  const guiaNota1000 = String(parsed?.guiaNota1000 || '').trim()
  await setDoc(
    doc(db, 'courses', courseId, 'config', 'redacao'),
    {
      tema,
      ...(guiaNota1000 ? { guiaNota1000 } : {}),
      status: 'disponivel',
      supervisorReviewed: true,
      updatedAt: serverTimestamp(),
      rotatedAt: serverTimestamp(),
      lastRotationReason: 'professor_online_weekly',
      bancaSnapshot: banca,
      concursoSnapshot: concurso,
      cargoSnapshot: cargo || concurso,
    },
    { merge: true },
  )

  const notified = await notifyCourseStudentsNewRedacaoTheme(courseId, tema)
  return {
    courseId,
    tema,
    summary: parsed?.summary || `Tema: ${tema.slice(0, 80)}`,
    notified,
  }
}

/**
 * Varre cursos com redação e gira tema se ≥ 7 dias.
 * Chamado pelo Professor IA enquanto o admin está online.
 */
export async function tickProfessorRedacaoWeekly() {
  if (!db) return { skipped: true, reason: 'no_db' }

  const coursesSnap = await getDocs(collection(db, 'courses'))
  const rotated = []
  const skipped = []

  for (const courseDoc of coursesSnap.docs) {
    const courseId = courseDoc.id
    if (courseDoc.data()?.active === false) continue

    try {
      const check = await shouldRotateCourse(courseId)
      if (!check.ok) {
        skipped.push({ courseId, reason: check.reason })
        continue
      }
      const outcome = await rotateThemeForCourse(courseId)
      rotated.push(outcome)
      console.info('[professorRedacao] tema rotacionado:', outcome)
      // Um curso por tick para não saturar a API
      break
    } catch (err) {
      console.warn(`[professorRedacao] ${courseId}:`, err?.message || err)
      skipped.push({ courseId, error: err?.message || String(err) })
    }
  }

  return { rotated, skipped, didRotate: rotated.length > 0 }
}
