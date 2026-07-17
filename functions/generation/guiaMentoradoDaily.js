const admin = require('firebase-admin')
const {
  getTodayKeyInSaoPaulo,
  getSaoPauloClockParts,
  collectDayKeysUpToToday,
} = require('./guiaMentoradoShared')
const {
  normalizeMentoradoAutomationConfig,
  isWithinDailyReleaseWindow,
} = require('./guiaMentoradoConfig')
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

const ACTIVE_JOB_STATUSES = [
  'pending',
  'running',
  'waiting_api',
  'waiting_timeout',
  'waiting_retry',
]

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

async function loadGuiaMentoradoConfig(courseId) {
  const snap = await getDb().doc(`courses/${courseId}/config/guiaMentorado`).get()
  const raw = snap.exists ? snap.data() : {}
  return { snap, raw, automation: normalizeMentoradoAutomationConfig(raw) }
}

async function hasActiveMentoradoJobs(courseId, userId) {
  if (!userId) return false
  const jobsSnap = await getDb()
    .collection(`users/${userId}/generationJobs`)
    .where('courseId', '==', courseId)
    .where('status', 'in', ACTIVE_JOB_STATUSES)
    .limit(40)
    .get()
  return jobsSnap.docs.some((d) => {
    const type = d.data()?.jobType
    return type === 'guia_mentorado_automation' || type === 'guia_mentorado_backfill'
  })
}

async function prepareDayAutomation(courseId, targetDate, options = {}) {
  const { raw, automation } = await loadGuiaMentoradoConfig(courseId)
  const intent = options.intent || 'daily_cron'
  const isManual = intent === 'manual_day' || options.force === true

  if (!isManual && !automation.enabled) {
    return { ok: false, reason: 'Automação desativada nas configurações.' }
  }
  if (isManual && !automation.triggers.allowManualDay && !options.force) {
    return { ok: false, reason: 'Geração manual desabilitada nas configurações.' }
  }
  if (intent === 'backfill' && !automation.triggers.allowBackfill && !options.force) {
    return { ok: false, reason: 'Backfill desabilitado nas configurações.' }
  }

  const dayEntry = await loadCronogramaDay(courseId, targetDate)
  if (!dayEntry) {
    return { ok: false, reason: `Dia ${targetDate} não encontrado no cronograma.` }
  }

  const tipo = dayEntry.type || dayEntry.tipo || 'estudo'
  if (tipo === 'simulado' || tipo === 'descanso' || tipo === 'taf' || tipo === 'redacao') {
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
    config: { ...raw, ...automation, autoGerarConteudo: automation.enabled },
    automation,
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
  const { automation } = await loadGuiaMentoradoConfig(courseId)
  const userId = automation.automationUserId
  if (!userId) return false

  const jobsSnap = await getDb()
    .collection(`users/${userId}/generationJobs`)
    .where('courseId', '==', courseId)
    .where('jobType', '==', 'guia_mentorado_automation')
    .where('status', 'in', ACTIVE_JOB_STATUSES)
    .limit(20)
    .get()

  return jobsSnap.docs.some((d) => d.data()?.serverPayload?.targetDate === targetDate)
}

async function startDayAutomation(courseId, targetDate, userId, options = {}) {
  if (await hasActiveAutomationJob(courseId, targetDate)) {
    return { started: false, reason: `Já existe job ativo para o dia ${targetDate}.`, duplicate: true }
  }

  const prepared = await prepareDayAutomation(courseId, targetDate, options)
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

  const effectiveUserId =
    userId || prepared.automation?.automationUserId || prepared.config.automationUserId
  if (!effectiveUserId) {
    throw new Error('Usuário admin não identificado para disparar automação.')
  }

  if (await hasActiveMentoradoJobs(courseId, effectiveUserId)) {
    const stillDay = await hasActiveAutomationJob(courseId, targetDate)
    if (!stillDay) {
      const backfillBusy = await getDb()
        .collection(`users/${effectiveUserId}/generationJobs`)
        .where('courseId', '==', courseId)
        .where('status', 'in', ACTIVE_JOB_STATUSES)
        .limit(40)
        .get()
      const hasBackfill = backfillBusy.docs.some(
        (d) => d.data()?.jobType === 'guia_mentorado_backfill',
      )
      if (hasBackfill) {
        return { started: false, reason: 'Backfill em andamento neste curso.', skipped: true }
      }
    }
  }

  await initDayStatus(courseId, targetDate, prepared.topics, null, effectiveUserId)

  const jobId = await spawnDayAutomationJob(
    effectiveUserId,
    courseId,
    targetDate,
    prepared.topicPayloads,
    options.metadata || {},
  )

  await updateDayStatus(courseId, targetDate, {
    jobId,
    status: 'running',
    automationUserId: effectiveUserId,
  })

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

async function markDailyRun(courseId, todayKey, extra = {}) {
  const ref = getDb().doc(`courses/${courseId}/config/guiaMentorado`)
  const updates = {
    'automation.lastDailyRunDayKey': todayKey,
    'automation.lastDailyRunAt': admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  if (extra.lastError !== undefined) {
    updates['automation.lastError'] = extra.lastError
  }
  try {
    await ref.update(updates)
  } catch (err) {
    // Doc pode existir sem o mapa automation ainda
    if (err.code === 5 || /not found|NOT_FOUND/i.test(String(err.message))) {
      await ref.set(
        {
          automation: {
            lastDailyRunDayKey: todayKey,
            lastDailyRunAt: admin.firestore.FieldValue.serverTimestamp(),
            lastError: extra.lastError ?? null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      return
    }
    throw err
  }
}

/**
 * Orquestrador diário unificado:
 * - Cron horário: só processa cursos cujo horário configurado bate com a hora atual (SP)
 * - Respeita enabled + triggers.onDailyCron (sem auto-ligar a flag)
 * - Até 3 jobs spawnados por tick quando há slots livres (round-robin entre cursos)
 */
async function runDailyMentoradoAutomationForAllCourses() {
  const todayKey = getTodayKeyInSaoPaulo()
  const clock = getSaoPauloClockParts()
  const db = getDb()
  const coursesSnap = await db.collection('courses').get()
  const results = []

  const { countActiveServerJobs, MAX_CONCURRENT_SERVER_JOBS } = require('./generationJobConcurrency')
  const activeCount = await countActiveServerJobs()
  const slotsAvailable = Math.max(0, MAX_CONCURRENT_SERVER_JOBS - activeCount)
  const maxSpawnThisTick = Math.min(3, slotsAvailable)

  if (maxSpawnThisTick <= 0) {
    console.log('[mentoradoDaily] slot ocupado — não spawna neste tick', { activeCount })
    return [{ skipped: true, reason: 'slot_ocupado', activeCount }]
  }

  let spawnedThisTick = 0
  let fallbackUserId = null
  try {
    const profSnap = await db.doc('config/professorFiscalizador').get()
    fallbackUserId = profSnap.exists ? profSnap.data()?.automationUserId || null : null
  } catch (_) {
    /* ignore */
  }

  for (const courseDoc of coursesSnap.docs) {
    if (spawnedThisTick >= maxSpawnThisTick) {
      results.push({
        courseId: courseDoc.id,
        skipped: true,
        reason: 'aguardando_proximo_tick_serial',
      })
      continue
    }

    const courseId = courseDoc.id
    const courseData = courseDoc.data() || {}
    if (courseData.active === false) continue

    try {
      const { snap, automation } = await loadGuiaMentoradoConfig(courseId)
      if (!snap.exists) {
        results.push({ courseId, skipped: true, reason: 'sem_guia_mentorado' })
        continue
      }

      if (!automation.enabled) {
        results.push({ courseId, skipped: true, reason: 'automacao_desligada' })
        continue
      }

      if (!automation.triggers.onDailyCron) {
        results.push({ courseId, skipped: true, reason: 'cron_diario_desligado' })
        continue
      }

      if (!isWithinDailyReleaseWindow(automation, clock)) {
        results.push({
          courseId,
          skipped: true,
          reason: 'fora_horario',
          hour: clock.hour,
          configuredHour: automation.schedule.dailyReleaseHour,
        })
        continue
      }

      if (automation.lastDailyRunDayKey === todayKey) {
        results.push({ courseId, skipped: true, reason: 'ja_rodou_hoje' })
        continue
      }

      const userId = automation.automationUserId || fallbackUserId || null
      if (!userId) {
        results.push({ courseId, skipped: true, reason: 'sem_automation_user' })
        continue
      }

      if (await hasActiveMentoradoJobs(courseId, userId)) {
        results.push({ courseId, skipped: true, reason: 'job_ativo' })
        continue
      }

      const dayKeys = await collectDayKeysUpToToday(courseId, getDb)
      let started = false
      let lastResult = null

      for (const dayKey of dayKeys) {
        const prepared = await prepareDayAutomation(courseId, dayKey, { intent: 'daily_cron' })
        if (!prepared.ok) continue

        const result = await startDayAutomation(courseId, dayKey, userId, {
          intent: 'daily_cron',
          metadata: { triggeredBy: 'daily_cron' },
        })
        lastResult = { courseId, dayKey, ...result }
        results.push(lastResult)
        console.log(`[mentoradoDaily] ${courseId} ${dayKey}:`, result)
        if (result.started) {
          started = true
          spawnedThisTick += 1
          break
        }
      }

      if (!started && spawnedThisTick < maxSpawnThisTick) {
        const todayResult = await startDayAutomation(courseId, todayKey, userId, {
          intent: 'daily_cron',
          metadata: { triggeredBy: 'daily_cron' },
        })
        lastResult = { courseId, dayKey: todayKey, ...todayResult }
        results.push(lastResult)
        console.log(`[mentoradoDaily] ${courseId} hoje:`, todayResult)
        started = Boolean(todayResult.started)
        if (started) spawnedThisTick += 1
      }

      // Só marca o dia se já está completo ou skip permanente.
      // Job iniciado NÃO marca — se falhar, o próximo tick pode retry
      // (hasActiveAutomationJob evita duplicata enquanto roda).
      const allDone = Boolean(lastResult?.allDone)
      const softSkip =
        lastResult?.duplicate ||
        lastResult?.skipped ||
        /backfill|job ativo|não encontrado|indisponível/i.test(
          String(lastResult?.reason || ''),
        )
      if (allDone) {
        await markDailyRun(courseId, todayKey, {
          lastError: lastResult?.reason || null,
        })
      } else if (started) {
        console.log(
          `[mentoradoDaily] ${courseId}: job iniciado — não marca o dia até concluir (retry se falhar)`,
        )
      } else if (softSkip) {
        console.log(
          `[mentoradoDaily] ${courseId}: não marca o dia (${lastResult?.reason || 'skip'}) — retry no próximo tick`,
        )
        try {
          await getDb()
            .doc(`courses/${courseId}/config/guiaMentorado`)
            .set(
              {
                automation: { lastError: lastResult?.reason || 'skip_sem_mark' },
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            )
        } catch (_) {
          /* ignore */
        }
      } else {
        // Dia simulado/descanso / sem conteúdo permanente: marca para não martelar o tick
        await markDailyRun(courseId, todayKey, {
          lastError: lastResult?.reason || null,
        })
      }
    } catch (err) {
      console.error(`[mentoradoDaily] erro em ${courseId}:`, err)
      results.push({ courseId, error: err.message })
      // Não marca o dia em erro inesperado — permite retry
      try {
        await getDb()
          .doc(`courses/${courseId}/config/guiaMentorado`)
          .set(
            {
              automation: { lastError: err.message },
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
      } catch (_) {
        /* ignore */
      }
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
  loadGuiaMentoradoConfig,
  hasActiveMentoradoJobs,
  markDailyRun,
}
