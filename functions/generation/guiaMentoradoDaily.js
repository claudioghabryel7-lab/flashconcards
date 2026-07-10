const admin = require('firebase-admin')
const { getTodayKeyInSaoPaulo } = require('./guiaMentoradoShared')
const {
  loadEditalVerticalizado,
  loadMentoradoAutomationContext,
  extractTopicsFromCronogramaDay,
  buildTopicPayloads,
} = require('./guiaMentoradoEdital')
const { processGuiaMentoradoAutomation } = require('./guiaMentoradoAutomation')

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
  if (!snap.exists()) return null
  const days = snap.data().days || {}
  return days[targetDate] || null
}

async function markDayContentGenerated(courseId, targetDate) {
  const db = getDb()
  const monthKey = monthKeyFromDateKey(targetDate)
  const ref = db.doc(`courses/${courseId}/cronograma/${monthKey}`)
  await ref.set(
    {
      [`days.${targetDate}.contentGenerated`]: true,
      [`days.${targetDate}.contentGeneratedAt`]: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

/**
 * Gera e libera conteúdos apenas dos tópicos do dia indicado.
 */
async function processMentoradoDayAutomation(courseId, targetDate, options = {}) {
  const { userId = null, jobId = null, updateJob = null, autoPublish = true } = options
  const noopUpdate = async () => {}

  const configSnap = await getDb().doc(`courses/${courseId}/config/guiaMentorado`).get()
  const config = configSnap.exists() ? configSnap.data() : {}
  if (!config.autoGerarConteudo) {
    return { skipped: true, reason: 'automação desativada', targetDate, topicCount: 0 }
  }

  const dayEntry = await loadCronogramaDay(courseId, targetDate)
  if (!dayEntry) {
    return { skipped: true, reason: 'dia não encontrado no cronograma', targetDate, topicCount: 0 }
  }

  if (dayEntry.contentGenerated) {
    return { skipped: true, reason: 'conteúdo do dia já gerado', targetDate, topicCount: 0 }
  }

  const tipo = dayEntry.type || dayEntry.tipo || 'estudo'
  if (tipo === 'simulado' || tipo === 'descanso') {
    await markDayContentGenerated(courseId, targetDate)
    return { skipped: true, reason: `dia tipo ${tipo}`, targetDate, topicCount: 0 }
  }

  const editalVerticalizado = await loadEditalVerticalizado(courseId)
  if (!editalVerticalizado) {
    throw new Error('Edital verticalizado não encontrado.')
  }

  const dayForExtraction = {
    data: targetDate,
    tipo,
    materias: dayEntry.materias || [],
  }

  const topics = extractTopicsFromCronogramaDay(dayForExtraction, editalVerticalizado)
  if (!topics.length) {
    await markDayContentGenerated(courseId, targetDate)
    return { skipped: true, reason: 'sem tópicos no dia', targetDate, topicCount: 0 }
  }

  const baseContext = await loadMentoradoAutomationContext(courseId)
  if (!baseContext.editalText?.trim()) {
    throw new Error('Texto do edital não encontrado para automação.')
  }

  const context = { ...baseContext, courseId }
  const topicPayloads = topics.map((topic) => buildTopicPayloads(topic, context, autoPublish))

  const progressFn = updateJob || noopUpdate
  const effectiveUserId = userId || config.automationUserId || 'system-mentorado'
  const effectiveJobId = jobId || `daily-${courseId}-${targetDate}`

  if (updateJob) {
    await progressFn(effectiveUserId, effectiveJobId, {
      message: `Dia ${targetDate}: ${topicPayloads.length} tópico(s)…`,
    })
  }

  const outcome = await processGuiaMentoradoAutomation(
    effectiveUserId,
    effectiveJobId,
    courseId,
    {
      autoPublish,
      targetDate,
      topics: topicPayloads,
    },
    progressFn,
  )

  await markDayContentGenerated(courseId, targetDate)

  return {
    skipped: false,
    targetDate,
    topicCount: topicPayloads.length,
    outcome,
  }
}

async function runDailyMentoradoAutomationForAllCourses() {
  const db = getDb()
  const todayKey = getTodayKeyInSaoPaulo()
  const coursesSnap = await db.collection('courses').get()
  const results = []

  for (const courseDoc of coursesSnap.docs) {
    const courseId = courseDoc.id
    const courseData = courseDoc.data()
    if (courseData.active === false) continue

    try {
      const configSnap = await db.doc(`courses/${courseId}/config/guiaMentorado`).get()
      if (!configSnap.exists() || !configSnap.data().autoGerarConteudo) continue

      const result = await processMentoradoDayAutomation(courseId, todayKey, {
        autoPublish: true,
      })
      results.push({ courseId, ...result })
      console.log(`[mentoradoDaily] ${courseId}:`, result)
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
  loadCronogramaDay,
  markDayContentGenerated,
}
