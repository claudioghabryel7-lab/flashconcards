/**
 * Automação global de conteúdo (admin online):
 * - 1 matéria revisada / dia até cobrir todas as disciplinas do edital
 * - 1 conteúdo de incidência / dia até cobrir todas as disciplinas
 * - 1 nível de questões faltante (1–10) a cada 6h, com rotação inteligente
 *   apenas em tópicos já liberados (status disponivel)
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
import { startBackgroundGeneration, getActiveGenerationCount } from './aiGenerationRunner'
import { loadEditalVerticalizado, makeTopicKey } from '../utils/editalVerticalizadoLoader'
import { loadTopicoPublishMap } from './topicoPublishService'
import { CONTENT_STATUS } from '../utils/contentStatus'
import {
  normalizeTopicKeyForStorage,
  sanitizeTopicKeyForFirestore,
  toSafeFirestoreDocId,
} from '../utils/topicKeyFirestore'
import {
  buildMateriaRevisadaAutomationPrompt,
  buildIncidenciaAutomationPrompt,
} from '../utils/contentAutomationPrompts'
import { buildMentoradoQuestoesPrompt } from '../utils/guiaMentoradoPrompts'
import { isWithinProfessorWindow } from './professorSupervisorService'
import { normalizeExamContext, resolveTipoProvaFromBanca } from '../utils/examFidelityContext'
import { QUESTOES_MIN_COMPLETE, QUESTOES_TARGET } from './localGenerationCheckpoint'

const CONFIG_PATH = ['config', 'contentAutomation']
const NIVEL_INTERVAL_MS = 6 * 60 * 60 * 1000
const NIVEIS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

let busy = false

function getTodayKeyInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date)
}

function sanitizeDisciplinaKey(name = '') {
  return String(name || '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 100)
}

/** Mesma regra do localJobProcessor para IDs de questoesTopico. */
function sanitizeTopicDocId(topicKey = '') {
  return (
    toSafeFirestoreDocId(topicKey) ||
    sanitizeTopicKeyForFirestore(normalizeTopicKeyForStorage(topicKey)) ||
    'topic_unknown'
  )
}

function hasUsableQuestoes(data = {}) {
  const arr = data.questoes || data.questoesPreditivas || data.questions
  return Array.isArray(arr) && arr.length >= QUESTOES_MIN_COMPLETE
}

function hasUsableMateriaRevisada(data = {}) {
  return (
    String(data.content || '').trim().length > 80 ||
    (Array.isArray(data.secoes) && data.secoes.length > 0) ||
    String(data.titulo || '').trim().length > 0
  )
}

function hasUsableIncidencia(data = {}) {
  return (
    (Array.isArray(data.analisePorTopico) && data.analisePorTopico.length > 0) ||
    (Array.isArray(data.topAssuntosGerais) && data.topAssuntosGerais.length > 0)
  )
}

async function patchAutomation(patch) {
  if (!db) return
  await setDoc(doc(db, ...CONFIG_PATH), { ...patch, updatedAt: serverTimestamp() }, { merge: true })
}

async function loadAutomationConfig() {
  const snap = await getDoc(doc(db, ...CONFIG_PATH))
  return snap.exists() ? snap.data() : { enabled: true }
}

async function loadCourseMeta(courseId) {
  const [courseSnap, unifiedSnap, editalSnap] = await Promise.all([
    getDoc(doc(db, 'courses', courseId)),
    getDoc(doc(db, 'courses', courseId, 'prompts', 'unified')),
    getDoc(doc(db, 'courses', courseId, 'prompts', 'edital')),
  ])
  const course = courseSnap.exists() ? courseSnap.data() : {}
  const unified = unifiedSnap.exists() ? unifiedSnap.data() : {}
  const editalData = editalSnap.exists() ? editalSnap.data() : {}
  const editalText = `${editalData.prompt || ''}\n\n${editalData.pdfText || ''}`.trim()
  return {
    courseName: course.name || course.competition || courseId,
    banca: unified.banca || course.banca || '',
    cargo: unified.cargo || course.cargo || '',
    concursoName: unified.concursoName || course.competition || '',
    nivelCurso: unified.nivel || course.nivel || '',
    editalText,
    active: course.active !== false,
  }
}

async function listActiveCourses() {
  const snap = await getDocs(collection(db, 'courses'))
  return snap.docs
    .filter((d) => d.data()?.active !== false)
    .map((d) => d.id)
}

function disciplinaListFromEdital(edital) {
  const disciplinas = Array.isArray(edital?.disciplinas) ? edital.disciplinas : []
  return disciplinas
    .map((d, idx) => ({
      nome: String(d?.nome || '').trim(),
      idx,
      topicos: Array.isArray(d?.topicos) ? d.topicos : [],
    }))
    .filter((d) => d.nome)
}

function pickNextAfterCursor(items, cursorKeyFn, lastCursor) {
  if (!items.length) return null
  if (!lastCursor) return items[0]
  const lastKey = cursorKeyFn(lastCursor)
  const idx = items.findIndex((it) => cursorKeyFn(it) === lastKey)
  if (idx < 0) return items[0]
  return items[(idx + 1) % items.length]
}

/** Filas diárias: matérias revisadas faltantes */
async function findReviewGaps(courseIds) {
  const gaps = []
  for (const courseId of courseIds) {
    let edital
    try {
      edital = await loadEditalVerticalizado(courseId)
    } catch {
      continue
    }
    const disciplinas = disciplinaListFromEdital(edital)
    if (!disciplinas.length) continue

    const existing = new Set()
    try {
      const snap = await getDocs(collection(db, 'courses', courseId, 'materiasRevisadas'))
      snap.docs.forEach((d) => {
        if (hasUsableMateriaRevisada(d.data())) {
          existing.add(d.id)
          const mat = String(d.data()?.materia || '').trim()
          if (mat) existing.add(sanitizeDisciplinaKey(mat))
        }
      })
    } catch {
      continue
    }

    disciplinas.forEach((d) => {
      const key = sanitizeDisciplinaKey(d.nome)
      if (!existing.has(key)) {
        gaps.push({ courseId, materia: d.nome, docId: key, disciplinaIdx: d.idx })
      }
    })
  }
  return gaps
}

/** Filas diárias: incidência faltante */
async function findIncidenciaGaps(courseIds) {
  const gaps = []
  for (const courseId of courseIds) {
    let edital
    try {
      edital = await loadEditalVerticalizado(courseId)
    } catch {
      continue
    }
    const disciplinas = disciplinaListFromEdital(edital)
    if (!disciplinas.length) continue

    const existing = new Set()
    try {
      const snap = await getDocs(collection(db, 'courses', courseId, 'conteudosIncidencia'))
      snap.docs.forEach((d) => {
        if (hasUsableIncidencia(d.data())) existing.add(d.id)
      })
    } catch {
      continue
    }

    disciplinas.forEach((d) => {
      const key = sanitizeDisciplinaKey(d.nome)
      if (!existing.has(key)) {
        gaps.push({
          courseId,
          disciplinaNome: d.nome,
          docId: key,
          disciplinaIdx: d.idx,
          topicos: d.topicos,
        })
      }
    })
  }
  return gaps
}

/**
 * Gaps de níveis 1–10 em tópicos já liberados.
 * Rotação: prioriza nível mais baixo, depois round-robin por curso/tópico.
 */
async function findNivelGaps(courseIds) {
  const gaps = []
  for (const courseId of courseIds) {
    let publishMap
    try {
      publishMap = await loadTopicoPublishMap(courseId)
    } catch {
      continue
    }

    const liberados = Object.entries(publishMap)
      .filter(([, st]) => st === CONTENT_STATUS.AVAILABLE)
      .map(([key]) => key)
    // dedupe por chave sanitizada
    const seenSanitized = new Set()
    const topics = []
    for (const topicKey of liberados) {
      const sanitized = sanitizeTopicDocId(topicKey)
      if (!sanitized || sanitized === 'topic_unknown' || seenSanitized.has(sanitized)) continue
      seenSanitized.add(sanitized)
      topics.push({ topicKey, sanitized })
    }
    if (!topics.length) continue

    let edital
    try {
      edital = await loadEditalVerticalizado(courseId)
    } catch {
      edital = null
    }
    const topicMeta = new Map()
    ;(edital?.disciplinas || []).forEach((disc) => {
      ;(disc.topicos || []).forEach((t) => {
        const key = makeTopicKey(t)
        const sanitized = sanitizeTopicDocId(key)
        topicMeta.set(sanitized, {
          topicKey: key,
          disciplina: disc.nome || '',
          topicoNome: t.nome || t.numero || key,
          topicoNumero: t.numero || '',
        })
      })
    })

    const existingNiveis = new Set()
    try {
      const snap = await getDocs(collection(db, 'courses', courseId, 'questoesTopico'))
      snap.docs.forEach((d) => {
        if (hasUsableQuestoes(d.data())) existingNiveis.add(d.id)
      })
    } catch {
      continue
    }

    topics.forEach(({ topicKey, sanitized }) => {
      const meta = topicMeta.get(sanitized) || {
        topicKey,
        disciplina: '',
        topicoNome: topicKey,
        topicoNumero: '',
      }
      NIVEIS.forEach((nivel) => {
        const docId = `${sanitized}_nivel_${nivel}`
        if (!existingNiveis.has(docId)) {
          gaps.push({
            courseId,
            topicKey: meta.topicKey || topicKey,
            sanitized,
            nivel,
            disciplina: meta.disciplina,
            topicoNome: meta.topicoNome,
            topicoNumero: meta.topicoNumero,
          })
        }
      })
    })
  }

  // Nível baixo primeiro; dentro do mesmo nível, ordena curso+tópico
  gaps.sort((a, b) => {
    if (a.nivel !== b.nivel) return a.nivel - b.nivel
    if (a.courseId !== b.courseId) return a.courseId.localeCompare(b.courseId)
    return String(a.sanitized).localeCompare(String(b.sanitized))
  })
  return gaps
}

async function startReviewJob(adminUserId, gap) {
  const meta = await loadCourseMeta(gap.courseId)
  if (!meta.editalText) throw new Error(`Edital ausente em ${gap.courseId}`)
  const prompt = buildMateriaRevisadaAutomationPrompt({
    materia: gap.materia,
    courseName: meta.courseName,
    banca: meta.banca,
    concursoName: meta.concursoName,
    editalText: meta.editalText,
  })

  await patchAutomation({
    phase: 'review',
    lastMessage: `Gerando matéria revisada: ${gap.materia}`,
    lastCourseId: gap.courseId,
    lastReviewCursor: { courseId: gap.courseId, materia: gap.materia, docId: gap.docId },
  })

  return startBackgroundGeneration({
    userId: adminUserId,
    courseId: gap.courseId,
    jobType: 'admin_materia_revisada',
    topicKey: gap.docId,
    metadata: { materia: gap.materia, source: 'content_automation' },
    serverPayload: {
      prompt,
      aiOptions: {
        useRAG: true,
        isLegalContent: true,
        generationConfig: { maxOutputTokens: 16000, temperature: 0.35 },
      },
      savePlan: {
        materia: gap.materia,
        docId: gap.docId,
        status: CONTENT_STATUS.AVAILABLE,
      },
    },
  })
}

async function startIncidenciaJob(adminUserId, gap) {
  const meta = await loadCourseMeta(gap.courseId)
  const prompt = buildIncidenciaAutomationPrompt({
    disciplinaNome: gap.disciplinaNome,
    topicos: gap.topicos,
    banca: meta.banca,
    cargo: meta.cargo,
    courseName: meta.courseName,
    editalText: meta.editalText,
  })

  await patchAutomation({
    phase: 'incidencia',
    lastMessage: `Gerando incidência: ${gap.disciplinaNome}`,
    lastCourseId: gap.courseId,
    lastIncidenciaCursor: {
      courseId: gap.courseId,
      disciplinaNome: gap.disciplinaNome,
      docId: gap.docId,
    },
  })

  return startBackgroundGeneration({
    userId: adminUserId,
    courseId: gap.courseId,
    jobType: 'conteudo_incidencia',
    topicKey: String(gap.disciplinaIdx),
    metadata: { disciplina: gap.disciplinaNome, source: 'content_automation' },
    serverPayload: {
      prompt,
      aiOptions: {
        useRAG: true,
        isLegalContent: true,
        generationConfig: { maxOutputTokens: 16000, temperature: 0.3 },
      },
      savePlan: {
        disciplinaNome: gap.disciplinaNome,
        disciplinaIdx: gap.disciplinaIdx,
        docId: gap.docId,
        status: CONTENT_STATUS.AVAILABLE,
      },
    },
  })
}

async function startNivelJob(adminUserId, gap) {
  const meta = await loadCourseMeta(gap.courseId)
  const exam = normalizeExamContext({
    banca: meta.banca,
    cargo: meta.cargo,
    concursoName: meta.concursoName,
    courseName: meta.courseName,
    nivel: meta.nivelCurso,
  })
  const tipoProva = resolveTipoProvaFromBanca(meta.banca) || 'ABCD'
  const prompt = buildMentoradoQuestoesPrompt({
    disciplina: gap.disciplina || 'Disciplina',
    topicoNome: gap.topicoNome || gap.topicKey,
    nivel: gap.nivel,
    editalText: meta.editalText,
    quantidadeQuestoes: QUESTOES_TARGET,
    ...exam,
    tipoProva,
  })

  await patchAutomation({
    phase: 'nivel',
    lastMessage: `Gerando questões nv.${gap.nivel}: ${gap.topicoNome || gap.topicKey}`,
    lastCourseId: gap.courseId,
    lastNivelCursor: {
      courseId: gap.courseId,
      topicKey: gap.topicKey,
      sanitized: gap.sanitized,
      nivel: gap.nivel,
    },
    lastNivelRunAt: serverTimestamp(),
  })

  return startBackgroundGeneration({
    userId: adminUserId,
    courseId: gap.courseId,
    jobType: 'questoes_topico',
    topicKey: gap.topicKey,
    metadata: { nivel: gap.nivel, source: 'content_automation' },
    serverPayload: {
      prompt,
      quantidadeQuestoes: QUESTOES_TARGET,
      aiOptions: {
        useGoogleSearch: true,
        isLegalContent: true,
        trustedGeneration: true,
        generationConfig: { maxOutputTokens: 16000, temperature: 0.2 },
      },
      savePlan: {
        topicKey: gap.topicKey,
        topicoNome: gap.topicoNome,
        disciplina: gap.disciplina,
        nivel: gap.nivel,
        status: CONTENT_STATUS.AVAILABLE,
        banca: meta.banca,
        cargo: meta.cargo,
        concursoName: meta.concursoName,
        courseName: meta.courseName,
      },
    },
  })
}

function nivelCursorKey(g) {
  return `${g.courseId}::${g.sanitized || g.topicKey}::${g.nivel}`
}

function reviewCursorKey(g) {
  return `${g.courseId}::${g.docId || sanitizeDisciplinaKey(g.materia)}`
}

function incidenciaCursorKey(g) {
  return `${g.courseId}::${g.docId || sanitizeDisciplinaKey(g.disciplinaNome)}`
}

/**
 * Força 1 passo da automação (mesma prioridade do tick).
 */
export async function forceContentAutomationNow(adminUserId) {
  return tickContentAutomationOnline(adminUserId, { force: true })
}

/**
 * Tick: no máx. 1 job. Prioridade: revisão diária → incidência diária → nível 6h.
 */
export async function tickContentAutomationOnline(adminUserId, { force = false } = {}) {
  if (!db || !adminUserId || busy) return { skipped: true, reason: 'busy' }
  if (typeof document !== 'undefined' && document.hidden) {
    return { skipped: true, reason: 'tab_hidden' }
  }
  if (getActiveGenerationCount() > 0) {
    return { skipped: true, reason: 'generation_active' }
  }

  busy = true
  const todayKey = getTodayKeyInSaoPaulo()

  try {
    const cfg = await loadAutomationConfig()
    if (cfg.enabled === false) {
      return { skipped: true, reason: 'disabled' }
    }

    if (cfg.useProfessorWindow) {
      const profSnap = await getDoc(doc(db, 'config', 'professorFiscalizador'))
      const prof = profSnap.exists() ? profSnap.data() : {}
      if (prof.recurringDaily && !isWithinProfessorWindow(prof)) {
        await patchAutomation({
          phase: 'waiting_window',
          lastMessage: 'Aguardando janela De/Até do Professor IA.',
        })
        return { skipped: true, reason: 'outside_professor_window' }
      }
    }

    const courseIds = await listActiveCourses()
    if (!courseIds.length) return { skipped: true, reason: 'no_courses' }

    // --- 1) Matéria revisada (1/dia) ---
    const reviewDoneToday = cfg.lastReviewDayKey === todayKey
    if (force || !reviewDoneToday) {
      const reviewGaps = await findReviewGaps(courseIds)
      if (reviewGaps.length) {
        const next = pickNextAfterCursor(reviewGaps, reviewCursorKey, cfg.lastReviewCursor)
        if (next) {
          await startReviewJob(adminUserId, next)
          await patchAutomation({
            lastReviewDayKey: todayKey,
            automationUserId: adminUserId,
            lastMessage: `Matéria revisada iniciada: ${next.materia} (${reviewGaps.length} restantes na fila)`,
            phase: 'review_started',
            stats: {
              ...(cfg.stats || {}),
              reviewRemaining: reviewGaps.length - 1,
            },
          })
          return { started: true, kind: 'review', courseId: next.courseId, materia: next.materia }
        }
      } else if (!reviewDoneToday) {
        await patchAutomation({
          lastReviewDayKey: todayKey,
          lastMessage: 'Fila de matéria revisada completa.',
          phase: 'review_done',
          stats: { ...(cfg.stats || {}), reviewRemaining: 0 },
        })
      }
    }

    // --- 2) Incidência (1/dia) ---
    const incidenciaDoneToday = cfg.lastIncidenciaDayKey === todayKey
    if (force || !incidenciaDoneToday) {
      const incGaps = await findIncidenciaGaps(courseIds)
      if (incGaps.length) {
        const next = pickNextAfterCursor(incGaps, incidenciaCursorKey, cfg.lastIncidenciaCursor)
        if (next) {
          await startIncidenciaJob(adminUserId, next)
          await patchAutomation({
            lastIncidenciaDayKey: todayKey,
            automationUserId: adminUserId,
            lastMessage: `Incidência iniciada: ${next.disciplinaNome} (${incGaps.length} restantes)`,
            phase: 'incidencia_started',
            stats: {
              ...(cfg.stats || {}),
              incidenciaRemaining: incGaps.length - 1,
            },
          })
          return {
            started: true,
            kind: 'incidencia',
            courseId: next.courseId,
            disciplina: next.disciplinaNome,
          }
        }
      } else if (!incidenciaDoneToday) {
        await patchAutomation({
          lastIncidenciaDayKey: todayKey,
          lastMessage: 'Fila de incidência completa.',
          phase: 'incidencia_done',
          stats: { ...(cfg.stats || {}), incidenciaRemaining: 0 },
        })
      }
    }

    // --- 3) Níveis 1–10 a cada 6h (tópicos liberados) ---
    const lastNivelMs = cfg.lastNivelRunAt?.toMillis?.() || cfg.lastNivelRunAtMs || 0
    const nivelDue = force || !lastNivelMs || Date.now() - lastNivelMs >= NIVEL_INTERVAL_MS
    if (nivelDue) {
      const nivelGaps = await findNivelGaps(courseIds)
      if (nivelGaps.length) {
        const next = pickNextAfterCursor(nivelGaps, nivelCursorKey, cfg.lastNivelCursor)
        if (next) {
          await startNivelJob(adminUserId, next)
          await patchAutomation({
            automationUserId: adminUserId,
            lastMessage: `Questões nv.${next.nivel} iniciadas: ${next.topicoNome || next.topicKey} (${nivelGaps.length} gaps)`,
            phase: 'nivel_started',
            lastNivelRunAtMs: Date.now(),
            stats: {
              ...(cfg.stats || {}),
              nivelGapsRemaining: nivelGaps.length - 1,
            },
          })
          return {
            started: true,
            kind: 'nivel',
            courseId: next.courseId,
            topicKey: next.topicKey,
            nivel: next.nivel,
          }
        }
      } else {
        await patchAutomation({
          lastNivelRunAt: serverTimestamp(),
          lastNivelRunAtMs: Date.now(),
          lastMessage: 'Todos os níveis 1–10 dos tópicos liberados estão gerados.',
          phase: 'nivel_done',
          stats: { ...(cfg.stats || {}), nivelGapsRemaining: 0 },
        })
        return { skipped: true, reason: 'nivel_queue_empty', checked: true }
      }
    }

    await patchAutomation({
      phase: 'idle',
      lastMessage: force
        ? 'Nada pendente agora (revisão/incidência do dia ok; níveis aguardam 6h ou fila vazia).'
        : 'Filas em dia — aguardando próxima janela (revisão/incidência amanhã ou níveis em 6h).',
    })
    return { skipped: true, reason: 'nothing_due', checked: true }
  } catch (err) {
    console.warn('[contentAutomation]', err)
    await patchAutomation({
      phase: 'error',
      lastMessage: err?.message || 'Erro na automação de conteúdo',
    })
    return { skipped: true, reason: 'error', error: err?.message }
  } finally {
    busy = false
  }
}
