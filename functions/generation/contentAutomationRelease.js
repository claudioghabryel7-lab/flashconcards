/**
 * Automação de conteúdo (mesmo estilo do Guia Mentorado):
 * - Tick a cada 30 min → 1 job só (não explode a API)
 * - Revezamento round-robin entre TODOS os cursos ativos
 * - Por curso: incidência (1/dia) → níveis 1 → depois 1 nível/dia (2→10)
 * - Só na janela De/Até do Professor (sem usar o Professor IA)
 */
const admin = require('firebase-admin')
const { getTodayKeyInSaoPaulo } = require('./guiaMentoradoShared')
const {
  loadEditalVerticalizado,
  loadMentoradoAutomationContext,
  makeTopicKey,
  formatTopicoAsModulo,
} = require('./guiaMentoradoEdital')
const { sanitizeTopicKeyForFirestore, sanitizeDisciplinaKey } = require('./topicKeyUtils')

const CONTENT_RELEASE_INTERVAL_MINUTES = 30
const MAX_NIVEL = 10

function getDb() {
  return admin.firestore()
}

function stateRef() {
  return getDb().doc('config/contentAutomation')
}

/** Só gera se estiver na mesma janela De/Até do Professor (Brasília). */
async function isWithinProfessorScheduleWindow() {
  const snap = await getDb().doc('config/professorFiscalizador').get()
  const data = snap.exists ? snap.data() || {} : {}
  const hasWindow =
    data.recurringDaily === true ||
    data.windowStartHour != null ||
    data.dailyStartHour != null
  if (!hasWindow) {
    return { open: false, reason: 'no_professor_schedule' }
  }
  const { isWithinScheduleWindow } = require('./professorSupervisorQueue')
  if (!isWithinScheduleWindow(data)) {
    return { open: false, reason: 'outside_professor_window' }
  }
  return { open: true }
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
  if (guiaSnap.exists && guiaSnap.data()?.automationUserId) {
    return guiaSnap.data().automationUserId
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

async function hasIncidencia(courseId, disciplinaNome) {
  const key = sanitizeDisciplinaKey(disciplinaNome)
  if (!key) return false
  const snap = await getDb().doc(`courses/${courseId}/conteudosIncidencia/${key}`).get()
  if (!snap.exists) return false
  const data = snap.data() || {}
  return Boolean(data.analisePorTopico || data.topAssuntosGerais || data.content || data.disciplina)
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
  const tipoProva =
    context.banca?.toUpperCase().includes('CESPE') ||
    context.banca?.toUpperCase().includes('CEBRASPE')
      ? 'Certo/Errado'
      : 'ABCD'

  const altBlock =
    tipoProva === 'Certo/Errado'
      ? `"respostaCorreta": "C"`
      : `"alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" }, "respostaCorreta": "A"`

  const dificuldade =
    nivel === 1
      ? 'básicas e diretas (conceitos fundamentais)'
      : nivel <= 3
        ? 'fáceis a médias'
        : nivel <= 6
          ? 'médias (análise e interpretação)'
          : nivel <= 8
            ? 'avançadas (casos complexos)'
            : 'especialista (nuances e casos excepcionais)'

  return `Gere 50 questões preditivas nível ${nivel} (${dificuldade}) para:
DISCIPLINA: ${topic.disciplina}
TÓPICO: ${topic.topicoNome}
BANCA: ${context.banca || 'não definida'}
CARGO: ${context.cargo || context.concursoName || ''}
TIPO: ${tipoProva}
NÍVEL: ${nivel} de ${MAX_NIVEL}
EDITAL: ${(context.editalText || '').slice(0, 10000)}
JSON: { "topico": "${topic.topicoNome}", "nivel": ${nivel}, "questoes": [{ "numero": 1, "enunciado": "", ${altBlock}, "explicacao": "" }] }
Retorne APENAS JSON válido.`
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
 * A cada tick (30 min, na janela do Professor): 1 job só, revezando cursos.
 */
async function runContentAutomationRelease({
  force = false,
  respectSchedule = true,
} = {}) {
  if (!force && respectSchedule) {
    const window = await isWithinProfessorScheduleWindow()
    if (!window.open) {
      return { skipped: true, reason: window.reason }
    }
  }

  const stateSnap = await stateRef().get()
  const state = stateSnap.exists ? stateSnap.data() || {} : {}
  const todayKey = getTodayKeyInSaoPaulo()

  const courses = await listActiveCourses()
  if (!courses.length) return { skipped: true, reason: 'no_courses' }

  const incidenciaByCourse = { ...(state.incidenciaByCourse || {}) }
  const progressionByCourse = { ...(state.progressionByCourse || {}) }

  // Round-robin: começa no próximo curso após o último atendido
  const startIdx = Math.max(0, Number(state.courseRotateIndex) || 0) % courses.length

  for (let offset = 0; offset < courses.length; offset += 1) {
    const idx = (startIdx + offset) % courses.length
    const course = courses[idx]
    const courseId = course.id
    const nextRotateIndex = (idx + 1) % courses.length

    try {
      const userId = await resolveAutomationUserId(courseId)
      if (!userId) continue

      const edital = await loadEditalVerticalizado(courseId)
      if (!edital?.disciplinas?.length) continue
      const topics = flattenEditalTopics(edital)

      // 1) Incidência deste curso (no máx. 1/dia por curso)
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
        // Nada pendente de incidência neste curso hoje
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

      // 2) Fundação: próximo nível 1 faltante
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

      // 3) Progressão: 1 nível/dia por curso (2→10)
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
  CONTENT_RELEASE_INTERVAL_MINUTES,
  MAX_NIVEL,
}
