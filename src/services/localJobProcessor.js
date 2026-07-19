/**
 * Processa jobs de geração na aba do admin (Gemini + Firestore client).
 * Sem Cloud Functions / Firebase Admin.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { generateAiJson } from '../utils/geminiApi'
import { buildFlashcardPrompt } from '../utils/unifiedPrompt'
import { buildMentoradoCronogramaPrompt } from '../utils/guiaMentoradoPrompts'
import { DEFAULT_PLANNING_DAYS } from '../constants/guiaMentorado'
import dayjs from 'dayjs'

function resolvePlanningEndDate(config = {}) {
  const today = dayjs().startOf('day')
  if (config.dataProva) {
    const prova = dayjs(config.dataProva).startOf('day')
    if (prova.isAfter(today)) return prova
  }
  return today.add(DEFAULT_PLANNING_DAYS, 'day')
}

function sanitizeTopicKey(topicKey = '') {
  return String(topicKey)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120)
}

function sanitizeDisciplinaKey(name = '') {
  return sanitizeTopicKey(name).toLowerCase() || 'disciplina'
}

async function saveMerge(courseId, collectionName, docId, parsed, extra = {}) {
  const ref = doc(db, 'courses', courseId, collectionName, docId)
  await setDoc(
    ref,
    {
      ...parsed,
      ...extra,
      updatedAt: serverTimestamp(),
      generatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return { collection: collectionName, docId }
}

async function processPromptSave(courseId, serverPayload, updateProgress, label, collectionName, docId, extra = {}) {
  const { prompt, aiOptions = {} } = serverPayload
  if (!prompt?.trim()) throw new Error(`Prompt ausente para ${label}.`)
  await updateProgress(20, `Gerando ${label}…`)
  const parsed = await generateAiJson(prompt, {
    courseId,
    trustedGeneration: true,
    isLegalContent: true,
    useRAG: aiOptions.useRAG ?? true,
    useGoogleSearch: aiOptions.useGoogleSearch ?? true,
    generationConfig: aiOptions.generationConfig,
  })
  await updateProgress(85, `Salvando ${label}…`)
  const resultRef = await saveMerge(courseId, collectionName, docId, parsed, extra)
  return { resultRef, parsed }
}

async function saveFlashcards(courseId, meta, cards, status = 'indisponivel') {
  const flashcardsRef = collection(db, 'courses', courseId, 'flashcards')
  let count = 0
  for (const card of cards) {
    const pergunta = card.pergunta || card.front || card.question
    const resposta = card.resposta || card.back || card.answer
    if (!pergunta || !resposta) continue
    await addDoc(flashcardsRef, {
      pergunta,
      resposta,
      materia: meta.disciplina || meta.materia || '',
      modulo: meta.modulo || '',
      topico: meta.topicoNome || meta.topico || '',
      topicKey: meta.topicKey || null,
      topicoNumero: meta.topicoNumero || null,
      banca: meta.banca || '',
      courseId,
      status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      source: 'local_admin_generation',
    })
    count += 1
  }
  return count
}

async function processFlashcardsTopico(courseId, serverPayload, updateProgress) {
  const meta = serverPayload?.savePlan?.flashcardMeta || {}
  const status = serverPayload?.savePlan?.status || 'indisponivel'
  await updateProgress(15, 'Gerando flashcards…')

  const basePrompt = await buildFlashcardPrompt(
    courseId,
    meta.disciplina || '',
    meta.editalText || '',
  )
  const prompt = `${basePrompt}

TAREFA: Criar exatamente 30 flashcards para o tópico "${meta.topicoNome || meta.topicKey}" da disciplina "${meta.disciplina}".
MÓDULO: ${meta.modulo || ''}
BANCA: ${meta.banca || ''}

Retorne APENAS JSON:
{ "flashcards": [ { "pergunta": "...", "resposta": "..." } ] }`

  const parsed = await generateAiJson(prompt, {
    courseId,
    trustedGeneration: true,
    isLegalContent: true,
    useRAG: true,
    useGoogleSearch: true,
    generationConfig: serverPayload?.aiOptions?.generationConfig || {
      maxOutputTokens: 24000,
      temperature: 0.35,
    },
  })

  const cards = parsed?.flashcards || parsed?.cards || []
  await updateProgress(80, `Salvando ${cards.length} flashcards…`)
  const count = await saveFlashcards(courseId, meta, cards, status)
  return { resultRef: { collection: 'flashcards', count }, parsed: { count } }
}

function dayStatusRef(courseId, targetDate) {
  return doc(db, 'courses', courseId, 'mentoradoAutomation', targetDate)
}

async function initLocalDayStatus(courseId, targetDate, topics, jobId, userId) {
  await setDoc(
    dayStatusRef(courseId, targetDate),
    {
      date: targetDate,
      courseId,
      status: 'running',
      totalTopics: topics.length,
      publishedCount: 0,
      jobId: jobId || null,
      automationUserId: userId || null,
      topics: topics.map((t) => ({
        topicKey: t.topicKey,
        topicoNome: t.topicoNome || t.topicKey,
        disciplina: t.disciplina || '',
        status: 'pending',
        step: 'aguardando',
        flashcards: 'pending',
        material: 'pending',
        questoes: 'pending',
        error: null,
      })),
      reason: null,
      updatedAt: serverTimestamp(),
      startedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

async function patchLocalTopicStatus(courseId, targetDate, topicKey, patch) {
  const ref = dayStatusRef(courseId, targetDate)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()
  const topics = (data.topics || []).map((t) =>
    t.topicKey === topicKey ? { ...t, ...patch } : t,
  )
  const publishedCount = topics.filter((t) => t.status === 'published').length
  await setDoc(
    ref,
    { topics, publishedCount, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

async function finalizeLocalDayStatus(courseId, targetDate, { errors = [], total = 0 } = {}) {
  const ref = dayStatusRef(courseId, targetDate)
  const snap = await getDoc(ref)
  const topics = snap.exists() ? snap.data().topics || [] : []
  const publishedCount = topics.filter((t) => t.status === 'published').length
  let status = 'done'
  if (publishedCount === 0 && errors.length) status = 'error'
  else if (publishedCount < total) status = 'partial'
  await setDoc(
    ref,
    {
      status,
      publishedCount,
      errors: errors.slice(0, 20),
      finishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

async function processGuiaMentoradoDay(courseId, serverPayload, updateProgress, { userId, jobId } = {}) {
  const topics = serverPayload?.topics || []
  if (!topics.length) throw new Error('Lista de tópicos ausente.')
  const targetDate = serverPayload?.targetDate
  if (!targetDate) throw new Error('Data do dia ausente.')

  const autoPublish = Boolean(serverPayload?.autoPublish)
  const publishStatus = autoPublish ? 'disponivel' : 'indisponivel'
  const errors = []
  let done = 0

  await initLocalDayStatus(courseId, targetDate, topics, jobId, userId)
  await updateProgress(8, `Gerando ${topics.length} tópico(s) do dia ${targetDate}…`)

  for (let i = 0; i < topics.length; i += 1) {
    const topic = topics[i]
    const topicKey = topic.topicKey || topic.topicoNome
    const sanitized = sanitizeTopicKey(topicKey)
    const label = topic.topicoNome || topicKey
    const pctBase = Math.round((i / topics.length) * 90) + 8

    try {
      await patchLocalTopicStatus(courseId, targetDate, topicKey, {
        status: 'generating',
        step: 'material',
        error: null,
      })
      await updateProgress(pctBase, `Tópico ${i + 1}/${topics.length}: ${label} — material`)

      if (topic.conteudoPrompt) {
        const parsed = await generateAiJson(topic.conteudoPrompt, {
          courseId,
          trustedGeneration: true,
          isLegalContent: true,
          useRAG: true,
          useGoogleSearch: true,
          generationConfig: { maxOutputTokens: 32000, temperature: 0.35 },
        })
        await saveMerge(courseId, 'conteudosCompletos', sanitized, parsed, {
          topicKey,
          disciplina: topic.disciplina,
          topico: topic.topicoNome,
          status: topic.publishStatus || publishStatus,
        })
      }
      await patchLocalTopicStatus(courseId, targetDate, topicKey, { material: 'done', step: 'questoes' })

      await updateProgress(pctBase + 3, `Tópico ${i + 1}/${topics.length}: ${label} — questões`)
      if (topic.questoesPrompt) {
        const parsed = await generateAiJson(topic.questoesPrompt, {
          courseId,
          trustedGeneration: true,
          isLegalContent: true,
          useRAG: true,
          useGoogleSearch: true,
        })
        await saveMerge(courseId, 'questoesTopico', `${sanitized}_nivel_1`, parsed, {
          topico: topic.topicoNome,
          nivel: 1,
          status: topic.publishStatus || publishStatus,
        })
      }
      await patchLocalTopicStatus(courseId, targetDate, topicKey, { questoes: 'done', step: 'flashcards' })

      await updateProgress(pctBase + 6, `Tópico ${i + 1}/${topics.length}: ${label} — flashcards`)
      if (topic.flashcardMeta) {
        await processFlashcardsTopico(
          courseId,
          {
            savePlan: {
              flashcardMeta: topic.flashcardMeta,
              status: topic.publishStatus || publishStatus,
            },
          },
          async () => {},
        )
      }

      await patchLocalTopicStatus(courseId, targetDate, topicKey, {
        status: 'published',
        step: 'concluído',
        flashcards: 'done',
        material: 'done',
        questoes: 'done',
        error: null,
      })
      done += 1
    } catch (err) {
      const message = err?.message || String(err)
      console.error(`[localJob] tópico ${topicKey}:`, message)
      errors.push({ topicKey, error: message })
      await patchLocalTopicStatus(courseId, targetDate, topicKey, {
        status: 'error',
        step: 'aguardando',
        error: message,
      }).catch(() => {})
      await updateProgress(pctBase + 6, `Erro em ${label} — seguindo…`)
    }
  }

  await finalizeLocalDayStatus(courseId, targetDate, { errors, total: topics.length })

  // Marca dia do cron diário (catch-up / programação) quando for o dia de hoje
  try {
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date())
    if (targetDate === todayKey) {
      await setDoc(
        doc(db, 'courses', courseId, 'config', 'guiaMentorado'),
        {
          automation: {
            lastDailyRunDayKey: todayKey,
            lastDailyRunAt: serverTimestamp(),
            lastError: errors.length ? errors[0]?.error || 'partial' : null,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }
  } catch {
    /* ignore */
  }

  await updateProgress(95, `Concluído — ${done}/${topics.length} tópico(s)`)
  return { publishedCount: done, totalTopics: topics.length, errors }
}

async function processGuiaMentoradoCronograma(courseId, serverPayload, updateProgress) {
  const config = serverPayload?.config || {}
  await updateProgress(10, 'Gerando cronograma…')

  const today = dayjs().startOf('day')
  const planningEnd = resolvePlanningEndDate(config)
  const editalSnap = await getDoc(doc(db, 'courses', courseId, 'editalVerticalizado', 'atual')).catch(() => null)
  let editalSummary = []
  if (editalSnap?.exists()) {
    editalSummary = editalSnap.data()?.materias || editalSnap.data()?.edital || []
  }

  const prompt = buildMentoradoCronogramaPrompt({
    today,
    planningEnd,
    config,
    editalSummary,
    usingDefaultWindow: !config.dataProva,
  })

  const parsed = await generateAiJson(prompt, {
    courseId,
    trustedGeneration: true,
    generationConfig: { maxOutputTokens: 32000, temperature: 0.3 },
  })

  const days = parsed?.cronograma || []
  await updateProgress(70, `Salvando ${days.length} dias…`)

  const byMonth = {}
  for (const day of days) {
    const date = day.data
    if (!date) continue
    const monthKey = date.slice(0, 7)
    if (!byMonth[monthKey]) byMonth[monthKey] = { days: {} }
    byMonth[monthKey].days[date] = {
      type: day.tipo || 'estudo',
      tipo: day.tipo || 'estudo',
      fase: day.fase || '',
      materias: day.materias || [],
      taf_exercicio: day.taf_exercicio || '',
      descricao: day.descricao || '',
    }
  }

  for (const [monthKey, data] of Object.entries(byMonth)) {
    const ref = doc(db, 'courses', courseId, 'cronograma', monthKey)
    const existing = await getDoc(ref)
    const prevDays = existing.exists() ? existing.data()?.days || {} : {}
    await setDoc(
      ref,
      {
        days: { ...prevDays, ...data.days },
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  await setDoc(
    doc(db, 'courses', courseId, 'guiaMentorado', 'config'),
    { ...(config || {}), updatedAt: serverTimestamp() },
    { merge: true },
  )

  return {
    totalDays: days.length,
    monthsCount: Object.keys(byMonth).length,
    autoGerarConteudo: Boolean(config?.autoGerarConteudo),
  }
}

async function processAdminEdital(courseId, serverPayload, updateProgress) {
  const editalText = serverPayload?.editalText || ''
  if (!editalText.trim()) throw new Error('Texto do edital ausente.')
  await updateProgress(15, 'Estruturando edital verticalizado…')

  const prompt = `Transforme o edital abaixo em JSON verticalizado para concurso.

EDITAL:
${editalText.slice(0, 120000)}

Retorne APENAS JSON:
{
  "materias": [
    {
      "nome": "Nome da matéria",
      "topicos": [
        { "numero": "1.1", "nome": "Nome do tópico" }
      ]
    }
  ]
}`

  const parsed = await generateAiJson(prompt, {
    courseId,
    trustedGeneration: true,
    generationConfig: { maxOutputTokens: 32000, temperature: 0.2 },
  })

  await updateProgress(85, 'Salvando edital…')
  await setDoc(
    doc(db, 'courses', courseId, 'editalVerticalizado', 'atual'),
    {
      ...parsed,
      rawText: editalText.slice(0, 50000),
      updatedAt: serverTimestamp(),
      generatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  await setDoc(
    doc(db, 'courses', courseId, 'prompts', 'edital'),
    { pdfText: editalText, prompt: editalText.slice(0, 20000), updatedAt: serverTimestamp() },
    { merge: true },
  )
  return { resultRef: { collection: 'editalVerticalizado', docId: 'atual' }, parsed }
}

/**
 * Executa o payload que antes ia para Cloud Functions — agora no browser.
 */
export async function processLocalGenerationJob({
  jobType,
  courseId,
  serverPayload = {},
  updateProgress = async () => {},
  userId = null,
  jobId = null,
}) {
  if (!courseId) throw new Error('courseId ausente.')
  if (!jobType) throw new Error('jobType ausente.')

  switch (jobType) {
    case 'conteudo_completo': {
      const topicKey = serverPayload.savePlan?.topicKey || ''
      const docId = sanitizeTopicKey(topicKey)
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'conteúdo',
        'conteudosCompletos',
        docId,
        {
          topicKey,
          status: serverPayload.savePlan?.status || 'indisponivel',
        },
      )
    }
    case 'questoes_topico': {
      const topicKey = serverPayload.savePlan?.topicKey || ''
      const nivel = serverPayload.savePlan?.nivel ?? 1
      const docId = `${sanitizeTopicKey(topicKey)}_nivel_${nivel}`
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'questões',
        'questoesTopico',
        docId,
        {
          topico: serverPayload.savePlan?.topicoNome || topicKey,
          nivel,
          status: serverPayload.savePlan?.status || 'indisponivel',
        },
      )
    }
    case 'conteudo_incidencia': {
      const docId =
        serverPayload.savePlan?.docId ||
        sanitizeDisciplinaKey(serverPayload.savePlan?.disciplinaNome)
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'conteúdo de incidência',
        'conteudosIncidencia',
        docId,
        {
          disciplinaIdx: serverPayload.savePlan?.disciplinaIdx,
          status: serverPayload.savePlan?.status || 'indisponivel',
        },
      )
    }
    case 'questoes_incidencia': {
      const nivel = serverPayload.savePlan?.nivel ?? 1
      const docId =
        serverPayload.savePlan?.docId ||
        `${sanitizeDisciplinaKey(serverPayload.savePlan?.disciplinaNome)}_nivel_${nivel}`
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'questões de incidência',
        'questoesIncidencia',
        docId,
        {
          disciplinaIdx: serverPayload.savePlan?.disciplinaIdx,
          nivel,
          status: serverPayload.savePlan?.status || 'indisponivel',
        },
      )
    }
    case 'admin_materia_revisada': {
      const materia = serverPayload.savePlan?.materia || 'materia'
      const docId =
        serverPayload.savePlan?.docId ||
        String(materia)
          .replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '_')
          .substring(0, 100)
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'matéria revisada',
        'materiasRevisadas',
        docId,
        {
          materia,
          status: serverPayload.savePlan?.status || 'indisponivel',
        },
      )
    }
    case 'flashcards_topico':
      return processFlashcardsTopico(courseId, serverPayload, updateProgress)
    case 'guia_mentorado_automation':
      return processGuiaMentoradoDay(courseId, serverPayload, updateProgress, { userId, jobId })
    case 'guia_mentorado_cronograma':
      return processGuiaMentoradoCronograma(courseId, serverPayload, updateProgress)
    case 'guia_mentorado_backfill': {
      // Backfill = gera conteúdos dos dias; se vier topics usa o mesmo pipeline do dia
      if (serverPayload?.topics?.length) {
        return processGuiaMentoradoDay(courseId, serverPayload, updateProgress, { userId, jobId })
      }
      throw new Error(
        'Backfill local: use "Gerar conteúdos do dia" por enquanto (admin online).',
      )
    }
    case 'admin_edital_verticalizado':
      return processAdminEdital(courseId, serverPayload, updateProgress)
    case 'vespera_prova': {
      const docId = serverPayload.savePlan?.docId || `vespera_${Date.now()}`
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'véspera de prova',
        'vesperaProva',
        docId,
        serverPayload.savePlan || {},
      )
    }
    case 'professor_supervisor': {
      const { processProfessorFlagLocal } = await import('./localProfessorFlagProcessor')
      if (serverPayload?.itemType === 'flag' || serverPayload?.payload?.flagId) {
        return processProfessorFlagLocal({
          courseId,
          payload: serverPayload.payload || serverPayload,
          updateProgress,
        })
      }
      throw new Error('Professor IA local: apenas sinalizações da Moderação por enquanto.')
    }
    default:
      throw new Error(`Tipo de job não suportado no modo local: ${jobType}`)
  }
}
