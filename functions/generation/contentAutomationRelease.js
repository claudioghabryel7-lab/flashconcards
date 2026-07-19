/**
 * Automação de conteúdo unificada:
 * - Tick a cada 30 min → 1 job (não explode a API)
 * - Round-robin entre cursos ativos
 * - Por curso: incidência (1/dia) → níveis 1 → 1 nível/dia (2→10)
 * - Janela própria em config/contentAutomation, com fallback para Professor / horário padrão
 */
const admin = require('firebase-admin')
const {
  getTodayKeyInSaoPaulo,
  getSaoPauloClockParts,
} = require('./guiaMentoradoShared')
const {
  loadEditalVerticalizado,
  loadMentoradoAutomationContext,
  makeTopicKey,
  formatTopicoAsModulo,
} = require('./guiaMentoradoEdital')
const { sanitizeTopicKeyForFirestore, sanitizeDisciplinaKey } = require('./topicKeyUtils')
const { buildQuestoesPrompt: buildUnifiedQuestoesPrompt } = require('./unifiedGenerationPrompts')

const CONTENT_RELEASE_INTERVAL_MINUTES = 30
const MAX_NIVEL = 10
/** Janela padrão (Brasília) se não houver config do Professor nem própria. */
const DEFAULT_WINDOW = { startHour: 6, startMinute: 0, endHour: 23, endMinute: 0 }

const CONTENT_JOB_TYPES = new Set(['conteudo_incidencia', 'questoes_topico'])
const ACTIVE_JOB_STATUSES = [
  'pending',
  'running',
  'waiting_api',
  'waiting_retry',
  'waiting_timeout',
]

function getDb() {
  return admin.firestore()
}

function stateRef() {
  return getDb().doc('config/contentAutomation')
}

function toMinutes(hour, minute) {
  return Number(hour || 0) * 60 + Number(minute || 0)
}

function isClockInWindow(clock, startHour, startMinute, endHour, endMinute) {
  const nowMin = toMinutes(clock.hour, clock.minute)
  const startMin = toMinutes(startHour, startMinute)
  const endMin = toMinutes(endHour, endMinute)
  if (endMin <= startMin) {
    // overnight
    return nowMin >= startMin || nowMin < endMin
  }
  return nowMin >= startMin && nowMin < endMin
}

/**
 * Janela de liberação de conteúdo (independente do Professor IA por padrão):
 * 1) enabled === false → fechado
 * 2) se useProfessorWindow === true → janela do Professor (opcional)
 * 3) senão janela própria em contentAutomation / DEFAULT 06–23
 */
async function isWithinContentAutomationWindow() {
  const stateSnap = await stateRef().get()
  const state = stateSnap.exists ? stateSnap.data() || {} : {}

  if (state.enabled === false) {
    return { open: false, reason: 'content_automation_disabled', source: 'contentAutomation' }
  }

  const clock = getSaoPauloClockParts()

  // Só compartilha janela com o Professor se o admin pedir explicitamente
  if (state.useProfessorWindow === true) {
    const profSnap = await getDb().doc('config/professorFiscalizador').get()
    const prof = profSnap.exists ? profSnap.data() || {} : {}
    const hasProfWindow =
      prof.recurringDaily === true ||
      prof.windowStartHour != null ||
      prof.dailyStartHour != null

    if (hasProfWindow) {
      const { isWithinScheduleWindow } = require('./professorSupervisorQueue')
      const open = isWithinScheduleWindow(prof)
      return {
        open,
        reason: open ? 'ok' : 'outside_professor_window',
        source: 'professorFiscalizador',
      }
    }
  }

  const startHour = state.windowStartHour ?? state.dailyStartHour ?? DEFAULT_WINDOW.startHour
  const startMinute = state.windowStartMinute ?? state.dailyStartMinute ?? DEFAULT_WINDOW.startMinute
  const endHour = state.windowEndHour ?? DEFAULT_WINDOW.endHour
  const endMinute = state.windowEndMinute ?? DEFAULT_WINDOW.endMinute
  const open = isClockInWindow(clock, startHour, startMinute, endHour, endMinute)
  return {
    open,
    reason: open ? 'ok' : 'outside_content_window',
    source: 'contentAutomation',
    window: { startHour, startMinute, endHour, endMinute },
  }
}

/** Compat: nome antigo usado pelo tick. */
async function isWithinProfessorScheduleWindow() {
  return isWithinContentAutomationWindow()
}

function flattenEditalTopics(edital) {
  const topics = []
  const disciplinas = edital?.disciplinas || []
  disciplinas.forEach((disciplina, disciplinaIdx) => {
    const nomeDisc = disciplina.nome || `Disciplina ${disciplinaIdx + 1}`
    for (const topico of disciplina.topicos || []) {
      const topicKey = normalizeTopicKey(makeTopicKey(topico))
      if (!topicKey) continue
      topics.push({
        topicKey,
        topicoNome: topico.nome || topicKey,
        topicoNumero: topico.numero || '',
        disciplina: nomeDisc,
        disciplinaIdx,
        modulo: formatTopicoAsModulo(topico),
      })
    }
  })
  return topics
}

function normalizeTopicKey(topicKey = '') {
  let key = String(topicKey || '').trim()
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(key)
      if (decoded === key) break
      key = decoded
    } catch {
      break
    }
  }
  return key.trim()
}

async function resolveAutomationUserId(courseId) {
  const db = getDb()
  const guiaSnap = await db.doc(`courses/${courseId}/config/guiaMentorado`).get()
  if (guiaSnap.exists) {
    const data = guiaSnap.data() || {}
    const nested = data.automation?.automationUserId
    if (nested) return nested
    if (data.automationUserId) return data.automationUserId
  }
  const stateSnap = await stateRef().get()
  if (stateSnap.exists && stateSnap.data()?.automationUserId) {
    return stateSnap.data().automationUserId
  }
  const profSnap = await db.doc('config/professorFiscalizador').get()
  return profSnap.exists ? profSnap.data()?.automationUserId || null : null
}

async function listActiveCourses() {
  const snap = await getDb().collection('courses').get()
  return snap.docs
    .filter((d) => d.data()?.active !== false)
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
}

async function hasActiveContentJob(userId, courseId) {
  if (!userId || !courseId) return false
  const snap = await getDb()
    .collection(`users/${userId}/generationJobs`)
    .where('courseId', '==', courseId)
    .where('status', 'in', ACTIVE_JOB_STATUSES)
    .limit(30)
    .get()
  return snap.docs.some((d) => CONTENT_JOB_TYPES.has(d.data()?.jobType))
}

async function hasQuestoesNivel(courseId, topicKey, nivel) {
  const sanitized = sanitizeTopicKeyForFirestore(topicKey)
  if (!sanitized) return false
  const snap = await getDb()
    .doc(`courses/${courseId}/questoesTopico/${sanitized}_nivel_${nivel}`)
    .get()
  if (!snap.exists) return false
  const data = snap.data() || {}
  const questoes = data.questoes || data.questions || []
  return Array.isArray(questoes) ? questoes.length > 0 : Boolean(questoes)
}

/** Incidência só conta se tiver análise real (não só campo disciplina vazio). */
async function hasIncidencia(courseId, disciplinaNome) {
  const key = sanitizeDisciplinaKey(disciplinaNome)
  if (!key) return false
  const snap = await getDb().doc(`courses/${courseId}/conteudosIncidencia/${key}`).get()
  if (!snap.exists) return false
  const data = snap.data() || {}

  const analise = data.analisePorTopico
  if (Array.isArray(analise) && analise.length > 0) return true

  const top = data.topAssuntosGerais
  if (Array.isArray(top) && top.length > 0) return true

  if (typeof data.content === 'string' && data.content.trim().length > 80) return true
  if (data.content && typeof data.content === 'object') {
    const keys = Object.keys(data.content)
    if (keys.length > 0) return true
  }

  return false
}

async function findNextMissingNivel1(courseId, topics) {
  for (const topic of topics) {
    if (!(await hasQuestoesNivel(courseId, topic.topicKey, 1))) {
      return { ...topic, nivel: 1 }
    }
  }
  return null
}

async function findNextMissingNivelProgression(courseId, topics) {
  for (let nivel = 2; nivel <= MAX_NIVEL; nivel += 1) {
    for (const topic of topics) {
      const hasPrev = await hasQuestoesNivel(courseId, topic.topicKey, nivel - 1)
      if (!hasPrev) continue
      if (!(await hasQuestoesNivel(courseId, topic.topicKey, nivel))) {
        return { ...topic, nivel }
      }
    }
  }
  return null
}

async function findNextMissingIncidencia(courseId, edital) {
  const disciplinas = edital?.disciplinas || []
  for (let i = 0; i < disciplinas.length; i += 1) {
    const disciplina = disciplinas[i]
    const nome = disciplina.nome || `Disciplina ${i + 1}`
    if (!(await hasIncidencia(courseId, nome))) {
      return { disciplina, disciplinaIdx: i, disciplinaNome: nome }
    }
  }
  return null
}

async function foundationComplete(courseId, edital, topics) {
  if (await findNextMissingIncidencia(courseId, edital)) return false
  if (await findNextMissingNivel1(courseId, topics)) return false
  return true
}

function buildQuestoesPrompt({ topic, context, nivel }) {
  return buildUnifiedQuestoesPrompt({
    disciplina: topic.disciplina,
    topicoNome: topic.topicoNome,
    topicKey: topic.topicKey,
    banca: context.banca,
    concursoName: context.concursoName,
    cargo: context.cargo,
    editalText: context.editalText,
    nivel,
    maxNivel: MAX_NIVEL,
    expectedCount: 50,
  })
}

function buildIncidenciaPrompt({ disciplina, disciplinaNome, context, editalText }) {
  const topicos = (disciplina.topicos || []).map((t) => ({
    numero: t.numero || '',
    nome: t.nome || '',
  }))

  return `Você é um especialista em análise de concursos públicos e previsão de temas para provas.

CONTEXTO:
- CURSO: ${context.courseName || 'Curso Preparatório'}
- CARGO: ${context.cargo || 'NÃO DEFINIDO'}
- BANCA EXAMINADORA: ${context.banca || 'NÃO DEFINIDA'}
- DISCIPLINA: ${disciplinaNome}

TÓPICOS DA DISCIPLINA:
${topicos.map((t, i) => `${i + 1}. ${t.numero} - ${t.nome}`).join('\n')}

EDITAL BASE (trecho):
${(editalText || '').substring(0, 10000)}

TAREFA: gere conteúdo de incidência (o que realmente cai) para esta disciplina.

JSON:
{
  "disciplina": "${disciplinaNome}",
  "banca": "${context.banca || ''}",
  "cargo": "${context.cargo || ''}",
  "curso": "${context.courseName || ''}",
  "analisePorTopico": [
    {
      "topicoNumero": "",
      "topicoNome": "",
      "assuntos": [{ "assunto": "", "probabilidade": 80, "revisao": "" }]
    }
  ],
  "topAssuntosGerais": [{ "assunto": "", "probabilidade": 90, "revisao": "" }],
  "dicasEstudo": ["dica"]
}
Retorne APENAS JSON válido.`
}

async function spawnContentJob(userId, courseId, jobType, serverPayload, metadata = {}) {
  const db = getDb()
  const ref = db.collection(`users/${userId}/generationJobs`).doc()
  const ts = admin.firestore.FieldValue.serverTimestamp()
  await ref.set({
    userId,
    courseId,
    jobType,
    topicKey: metadata.topicKey || null,
    metadata: {
      source: 'content_automation',
      ...metadata,
    },
    runOnServer: true,
    serverPayload,
    status: 'pending',
    progress: 0,
    message: 'Automação — liberando conteúdo…',
    createdAt: ts,
    updatedAt: ts,
  })

  const { kickServerJobAfterCreate } = require('./generationJobKick')
  await kickServerJobAfterCreate(userId, ref.id).catch((err) => {
    console.warn(`[spawnContentJob] kick ${ref.id}:`, err?.message || err)
  })

  return ref.id
}

async function patchState(patch) {
  await stateRef().set(
    {
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

/**
 * @param {{ force?: boolean, respectSchedule?: boolean }} opts
 */
async function runContentAutomationRelease({
  force = false,
  respectSchedule = true,
} = {}) {
  if (!force && respectSchedule) {
    const window = await isWithinContentAutomationWindow()
    if (!window.open) {
      return { skipped: true, reason: window.reason, source: window.source }
    }
  }

  const stateSnap = await stateRef().get()
  const state = stateSnap.exists ? stateSnap.data() || {} : {}

  if (!force && state.enabled === false) {
    return { skipped: true, reason: 'content_automation_disabled' }
  }

  const todayKey = getTodayKeyInSaoPaulo()
  const courses = await listActiveCourses()
  if (!courses.length) return { skipped: true, reason: 'no_courses' }

  const incidenciaByCourse = { ...(state.incidenciaByCourse || {}) }
  const progressionByCourse = { ...(state.progressionByCourse || {}) }
  const startIdx = Math.max(0, Number(state.courseRotateIndex) || 0) % courses.length

  for (let offset = 0; offset < courses.length; offset += 1) {
    const idx = (startIdx + offset) % courses.length
    const course = courses[idx]
    const courseId = course.id
    const nextRotateIndex = (idx + 1) % courses.length

    try {
      const userId = await resolveAutomationUserId(courseId)
      if (!userId) continue

      if (await hasActiveContentJob(userId, courseId)) {
        await patchState({
          courseRotateIndex: nextRotateIndex,
          lastMessage: `[${course.name || courseId}] job de conteúdo já ativo — próximo curso`,
        })
        continue
      }

      const edital = await loadEditalVerticalizado(courseId)
      if (!edital?.disciplinas?.length) continue
      const topics = flattenEditalTopics(edital)

      if (incidenciaByCourse[courseId] !== todayKey) {
        const missingInc = await findNextMissingIncidencia(courseId, edital)
        if (missingInc) {
          const context = await loadMentoradoAutomationContext(courseId)
          const prompt = buildIncidenciaPrompt({
            disciplina: missingInc.disciplina,
            disciplinaNome: missingInc.disciplinaNome,
            context,
            editalText: context.editalText,
          })
          const docId = sanitizeDisciplinaKey(missingInc.disciplinaNome)
          const jobId = await spawnContentJob(
            userId,
            courseId,
            'conteudo_incidencia',
            {
              prompt,
              aiOptions: {
                useRAG: true,
                useGoogleSearch: true,
                generationConfig: { maxOutputTokens: 16000, temperature: 0.45 },
              },
              savePlan: {
                disciplinaNome: missingInc.disciplinaNome,
                disciplinaIdx: missingInc.disciplinaIdx,
                docId,
                status: 'disponivel',
              },
            },
            { kind: 'incidencia', disciplina: missingInc.disciplinaNome },
          )

          incidenciaByCourse[courseId] = todayKey
          await patchState({
            courseRotateIndex: nextRotateIndex,
            lastCourseId: courseId,
            incidenciaByCourse,
            progressionByCourse,
            lastIncidenciaJobId: jobId,
            phase: 'incidencia',
            lastMessage: `[${course.name || courseId}] Incidência: ${missingInc.disciplinaNome}`,
          })

          return {
            started: true,
            kind: 'incidencia',
            courseId,
            jobId,
            label: missingInc.disciplinaNome,
            rotateNext: nextRotateIndex,
          }
        }
        incidenciaByCourse[courseId] = todayKey
      }

      if (!topics.length) {
        await patchState({
          courseRotateIndex: nextRotateIndex,
          incidenciaByCourse,
          progressionByCourse,
        })
        continue
      }

      const context = await loadMentoradoAutomationContext(courseId)
      const ready = await foundationComplete(courseId, edital, topics)

      if (!ready) {
        const missing = await findNextMissingNivel1(courseId, topics)
        if (!missing) {
          await patchState({
            courseRotateIndex: nextRotateIndex,
            incidenciaByCourse,
            progressionByCourse,
          })
          continue
        }

        const nivel = 1
        const sanitized = sanitizeTopicKeyForFirestore(missing.topicKey)
        const prompt = buildQuestoesPrompt({ topic: missing, context, nivel })
        const jobId = await spawnContentJob(
          userId,
          courseId,
          'questoes_topico',
          {
            prompt,
            aiOptions: {
              useRAG: true,
              useGoogleSearch: true,
              generationConfig: { maxOutputTokens: 32000, temperature: 0.4 },
            },
            savePlan: {
              topicKey: missing.topicKey,
              topicoNome: missing.topicoNome,
              docId: `${sanitized}_nivel_${nivel}`,
              nivel,
              status: 'disponivel',
            },
          },
          { kind: 'questoes_nivel', nivel, topicKey: missing.topicKey },
        )

        await patchState({
          courseRotateIndex: nextRotateIndex,
          lastCourseId: courseId,
          incidenciaByCourse,
          progressionByCourse,
          lastNivelJobId: jobId,
          lastNivel: nivel,
          phase: 'foundation',
          lastMessage: `[${course.name || courseId}] Nível 1: ${missing.topicoNome}`,
        })

        return {
          started: true,
          kind: 'questoes_nivel',
          courseId,
          jobId,
          nivel,
          label: missing.topicoNome,
          rotateNext: nextRotateIndex,
        }
      }

      if (!force && progressionByCourse[courseId] === todayKey) {
        await patchState({
          courseRotateIndex: nextRotateIndex,
          incidenciaByCourse,
          progressionByCourse,
        })
        continue
      }

      const missing = await findNextMissingNivelProgression(courseId, topics)
      if (!missing) {
        await patchState({
          courseRotateIndex: nextRotateIndex,
          incidenciaByCourse,
          progressionByCourse,
          lastMessage: `[${course.name || courseId}] níveis 1–${MAX_NIVEL} completos`,
        })
        continue
      }

      const nivel = missing.nivel
      const sanitized = sanitizeTopicKeyForFirestore(missing.topicKey)
      const prompt = buildQuestoesPrompt({ topic: missing, context, nivel })
      const jobId = await spawnContentJob(
        userId,
        courseId,
        'questoes_topico',
        {
          prompt,
          aiOptions: {
            useRAG: true,
            useGoogleSearch: true,
            generationConfig: { maxOutputTokens: 32000, temperature: 0.4 },
          },
          savePlan: {
            topicKey: missing.topicKey,
            topicoNome: missing.topicoNome,
            docId: `${sanitized}_nivel_${nivel}`,
            nivel,
            status: 'disponivel',
          },
        },
        { kind: 'questoes_nivel', nivel, topicKey: missing.topicKey },
      )

      progressionByCourse[courseId] = todayKey
      await patchState({
        courseRotateIndex: nextRotateIndex,
        lastCourseId: courseId,
        incidenciaByCourse,
        progressionByCourse,
        lastNivelJobId: jobId,
        lastNivel: nivel,
        phase: 'progression',
        lastMessage: `[${course.name || courseId}] Nível ${nivel}/dia: ${missing.topicoNome}`,
      })

      return {
        started: true,
        kind: 'questoes_nivel',
        courseId,
        jobId,
        nivel,
        label: missing.topicoNome,
        rotateNext: nextRotateIndex,
      }
    } catch (err) {
      console.warn(`[contentAutomation] curso ${course.id}:`, err.message)
    }
  }

  await patchState({
    courseRotateIndex: (startIdx + 1) % courses.length,
    incidenciaByCourse,
    progressionByCourse,
    lastMessage: 'Nada pendente neste ciclo — próximos cursos na fila',
  })

  return { skipped: true, reason: 'nothing_pending', courses: courses.length }
}

module.exports = {
  runContentAutomationRelease,
  isWithinProfessorScheduleWindow,
  isWithinContentAutomationWindow,
  hasIncidencia,
  CONTENT_RELEASE_INTERVAL_MINUTES,
  MAX_NIVEL,
  DEFAULT_WINDOW,
}
