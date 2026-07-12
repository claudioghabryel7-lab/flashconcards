const admin = require('firebase-admin')
const { getTodayKeyInSaoPaulo, collectDayKeysUpToToday } = require('./guiaMentoradoShared')
const {
  loadEditalVerticalizado,
  loadMentoradoAutomationContext,
  extractTopicsFromCronogramaDay,
  buildTopicPayloads,
} = require('./guiaMentoradoEdital')
const { isTopicContentComplete } = require('./guiaMentoradoAutomation')
const {
  initDayStatus,
  updateDayStatus,
  markDayContentGenerated,
} = require('./guiaMentoradoStatus')
const { sanitizeTopicKeyForFirestore } = require('./topicKeyUtils')

function getDb() {
  return admin.firestore()
}

function monthKeyFromDateKey(dateKey) {
  return String(dateKey).slice(0, 7)
}

async function loadCronogramaDay(courseId, targetDate) {
  const db = getDb()
  const monthKey = monthKeyFromDateKey(targetDate)
  const snap = await db.doc(`courses/${courseId}/cronograma/${monthKey}`).get()
  if (!snap.exists) return null
  const days = snap.data().days || {}
  return days[targetDate] || null
}

async function prepareDayAutomation(courseId, targetDate) {
  const configSnap = await getDb().doc(`courses/${courseId}/config/guiaMentorado`).get()
  const config = configSnap.exists ? configSnap.data() : {}
  if (!config.autoGerarConteudo) {
    return { ok: false, reason: 'Automação desativada nas configurações.' }
  }

  const dayEntry = await loadCronogramaDay(courseId, targetDate)
  if (!dayEntry) {
    return { ok: false, reason: `Dia ${targetDate} não encontrado no cronograma.` }
  }

  const tipo = dayEntry.type || dayEntry.tipo || 'estudo'
  if (tipo === 'simulado' || tipo === 'descanso') {
    return { ok: false, reason: `Dia marcado como ${tipo} — sem conteúdos para gerar.` }
  }

  const editalVerticalizado = await loadEditalVerticalizado(courseId)
  if (!editalVerticalizado?.disciplinas?.length) {
    return { ok: false, reason: 'Edital verticalizado não encontrado.' }
  }

  const topics = extractTopicsFromCronogramaDay(
    { data: targetDate, tipo, materias: dayEntry.materias || [] },
    editalVerticalizado,
  )

  if (!topics.length) {
    return {
      ok: false,
      reason: 'Nenhum tópico reconhecido para este dia. Verifique se as matérias do cronograma batem com o edital.',
      materias: dayEntry.materias || [],
    }
  }

  const baseContext = await loadMentoradoAutomationContext(courseId)
  if (!baseContext.editalText?.trim()) {
    return { ok: false, reason: 'Texto do edital indisponível para a IA.' }
  }

  const context = { ...baseContext, courseId }
  const topicPayloads = topics.map((topic) => buildTopicPayloads(topic, context))

  const pendingTopics = []
  for (const topic of topics) {
    const readiness = await isTopicContentComplete(courseId, topic)
    const statusSnap = await getDb()
      .doc(`courses/${courseId}/topicoStatus/${sanitizeTopicKeyForFirestore(topic.topicKey)}`)
      .get()
    const isPublished =
      statusSnap.exists && statusSnap.data().status === 'disponivel' && readiness.complete
    if (!isPublished) pendingTopics.push(topic)
  }

  const pendingPayloads = topicPayloads.filter((p) =>
    pendingTopics.some((t) => t.topicKey === p.topicKey),
  )

  if (!pendingPayloads.length) {
    await markDayContentGenerated(courseId, targetDate, topics.length, topics.length)
    return { ok: false, reason: 'Todos os tópicos deste dia já estão gerados e liberados.', allDone: true }
  }

  return {
    ok: true,
    config,
    topics: pendingTopics,
    topicPayloads: pendingPayloads,
    totalTopics: topics.length,
  }
}

async function spawnDayAutomationJob(userId, courseId, targetDate, topicPayloads, metadata = {}) {
  const db = getDb()
  const ref = db.collection(`users/${userId}/generationJobs`).doc()
  const ts = admin.firestore.FieldValue.serverTimestamp()

  await ref.set({
    userId,
    courseId,
    jobType: 'guia_mentorado_automation',
    topicKey: null,
    metadata: {
      targetDate,
      topicCount: topicPayloads.length,
      ...metadata,
    },
    runOnServer: true,
    serverPayload: {
      courseId,
      targetDate,
      autoPublish: true,
      topics: topicPayloads,
    },
    status: 'pending',
    progress: 0,
    message: `Preparando conteúdos do dia ${targetDate}…`,
    createdAt: ts,
    updatedAt: ts,
  })

  return ref.id
}

async function hasActiveAutomationJob(courseId, targetDate) {
  const configSnap = await getDb().doc(`courses/${courseId}/config/guiaMentorado`).get()
  const userId = configSnap.exists ? configSnap.data().automationUserId : null
  if (!userId) return false

  const jobsSnap = await getDb()
    .collection(`users/${userId}/generationJobs`)
    .where('courseId', '==', courseId)
    .where('jobType', '==', 'guia_mentorado_automation')
    .where('status', 'in', ['pending', 'running', 'waiting_api', 'waiting_timeout', 'waiting_retry'])
    .limit(20)
    .get()

  return jobsSnap.docs.some((d) => d.data()?.serverPayload?.targetDate === targetDate)
}

async function startDayAutomation(courseId, targetDate, userId, options = {}) {
  if (await hasActiveAutomationJob(courseId, targetDate)) {
    return { started: false, reason: `Já existe job ativo para o dia ${targetDate}.`, duplicate: true }
  }

  const prepared = await prepareDayAutomation(courseId, targetDate)
  if (!prepared.ok) {
    if (prepared.reason && !prepared.allDone) {
      await initDayStatus(courseId, targetDate, [])
      await updateDayStatus(courseId, targetDate, {
        status: 'skipped',
        reason: prepared.reason,
        materias: prepared.materias || null,
      })
    }
    return { started: false, ...prepared }
  }

  const effectiveUserId = userId || prepared.config.automationUserId
  if (!effectiveUserId) {
    throw new Error('Usuário admin não identificado para disparar automação.')
  }

  await initDayStatus(courseId, targetDate, prepared.topics)

  const jobId = await spawnDayAutomationJob(
    effectiveUserId,
    courseId,
    targetDate,
    prepared.topicPayloads,
    options.metadata || {},
  )

  await updateDayStatus(courseId, targetDate, { jobId, status: 'running' })

  return {
    started: true,
    jobId,
    topicCount: prepared.topicPayloads.length,
    totalTopics: prepared.totalTopics,
    targetDate,
  }
}

async function processMentoradoDayAutomation(courseId, targetDate, options = {}) {
  const { userId = null } = options
  return startDayAutomation(courseId, targetDate, userId, options)
}

async function runDailyMentoradoAutomationForAllCourses() {
  const todayKey = getTodayKeyInSaoPaulo()
  const coursesSnap = await getDb().collection('courses').get()
  const results = []

  for (const courseDoc of coursesSnap.docs) {
    const courseId = courseDoc.id
    const courseData = courseDoc.data()
    if (courseData.active === false) continue

    try {
      const configSnap = await getDb().doc(`courses/${courseId}/config/guiaMentorado`).get()
      if (!configSnap.exists || !configSnap.data().autoGerarConteudo) continue

      const userId = configSnap.data().automationUserId || null
      const dayKeys = await collectDayKeysUpToToday(courseId, getDb)
      let started = false

      for (const dayKey of dayKeys) {
        const prepared = await prepareDayAutomation(courseId, dayKey)
        if (!prepared.ok) continue

        const result = await startDayAutomation(courseId, dayKey, userId)
        results.push({ courseId, dayKey, ...result })
        console.log(`[mentoradoDaily] ${courseId} ${dayKey}:`, result)
        if (result.started) {
          started = true
          break
        }
      }

      if (!started) {
        const todayResult = await startDayAutomation(courseId, todayKey, userId)
        results.push({ courseId, dayKey: todayKey, ...todayResult })
        console.log(`[mentoradoDaily] ${courseId} hoje:`, todayResult)
      }
    } catch (err) {
      console.error(`[mentoradoDaily] erro em ${courseId}:`, err)
      results.push({ courseId, error: err.message })
    }
  }

  return results
}

module.exports = {
  processMentoradoDayAutomation,
  runDailyMentoradoAutomationForAllCourses,
  prepareDayAutomation,
  startDayAutomation,
  loadCronogramaDay,
}
