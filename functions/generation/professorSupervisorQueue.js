const admin = require('firebase-admin')
const { getTodayKeyInSaoPaulo, getSaoPauloClockParts, formatDailyStartLabel } = require('./guiaMentoradoShared')
const { loadCronogramaDay } = require('./guiaMentoradoDaily')
const { loadEditalVerticalizado, extractTopicsFromCronogramaDay, resolveTopicFromEdital } = require('./guiaMentoradoEdital')
const { isTopicContentComplete } = require('./guiaMentoradoAutomation')
const { sanitizeTopicKeyForFirestore } = require('./topicKeyUtils')
const { SESSION_HOURS, INTERVAL_MINUTES, REVIEW_COOLDOWN_DAYS } = require('./professorSupervisorShared')

const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000
const BACKLOG_TOPICS_PER_COURSE = null
const DIGITACAO_INTERVAL_MINUTES = 0
const REDACAO_ROTATE_DAYS = 7
const REDACAO_ROTATE_MS = REDACAO_ROTATE_DAYS * 24 * 60 * 60 * 1000

function getDb() {
  return admin.firestore()
}

function configRef() {
  return getDb().doc('config/professorFiscalizador')
}

function toMinutes(hour, minute) {
  return Number(hour || 0) * 60 + Number(minute || 0)
}

function getWindowBounds(data = {}) {
  const startHour = data.windowStartHour ?? data.dailyStartHour ?? 0
  const startMinute = data.windowStartMinute ?? data.dailyStartMinute ?? 0
  const endHour = data.windowEndHour ?? ((startHour + SESSION_HOURS) % 24)
  const endMinute = data.windowEndMinute ?? 0
  return { startHour, startMinute, endHour, endMinute }
}

function formatWindowLabel(data = {}) {
  const w = getWindowBounds(data)
  return `${formatDailyStartLabel(w.startHour, w.startMinute)}–${formatDailyStartLabel(w.endHour, w.endMinute)}`
}

/** Está dentro da janela diária (America/Sao_Paulo)? Suporta overnight. */
function isWithinScheduleWindow(data = {}) {
  const w = getWindowBounds(data)
  const now = getSaoPauloClockParts()
  const nowMin = toMinutes(now.hour, now.minute)
  const startMin = toMinutes(w.startHour, w.startMinute)
  const endMin = toMinutes(w.endHour, w.endMinute)
  if (endMin > startMin) {
    return nowMin >= startMin && nowMin < endMin
  }
  // Overnight: ex. 22:00 → 06:00
  return nowMin >= startMin || nowMin < endMin
}

function computeSessionEndsAtFromWindow(data = {}) {
  const w = getWindowBounds(data)
  const now = getSaoPauloClockParts()
  const nowMin = toMinutes(now.hour, now.minute)
  const startMin = toMinutes(w.startHour, w.startMinute)
  const endMin = toMinutes(w.endHour, w.endMinute)
  const overnight = endMin <= startMin

  let minutesLeft
  if (!overnight) {
    minutesLeft = Math.max(1, endMin - nowMin)
  } else if (nowMin >= startMin) {
    minutesLeft = Math.max(1, 24 * 60 - nowMin + endMin)
  } else {
    minutesLeft = Math.max(1, endMin - nowMin)
  }

  return admin.firestore.Timestamp.fromDate(new Date(Date.now() + minutesLeft * 60 * 1000))
}

function shouldStartDailySession(data = {}) {
  if (!data.recurringDaily || !data.automationUserId || data.enabled) return false
  if (!isWithinScheduleWindow(data)) return false
  const todayKey = getTodayKeyInSaoPaulo()
  // Já rodou nesta janela hoje e encerrou → só retoma se ainda estiver na janela
  // e a sessão anterior não tiver sido marcada como "completa no dia".
  // Permitimos retomar se lastAutoStartDate === today mas phase waiting e ainda na janela
  // (ex.: admin limpou fila). Evita loop: só starta se enabled=false e within window.
  if (data.lastAutoStartDate === todayKey && data.phase === 'session_expired') {
    return false
  }
  return true
}

async function startSupervisorSession(userId, { auto = false, dailyStartHour, dailyStartMinute, windowEndHour, windowEndMinute } = {}) {
  const todayKey = getTodayKeyInSaoPaulo()
  const clock = getSaoPauloClockParts()
  const snap = await configRef().get()
  const prev = snap.exists ? snap.data() : {}

  const startHour = dailyStartHour ?? prev.windowStartHour ?? prev.dailyStartHour ?? clock.hour
  const startMinute = dailyStartMinute ?? prev.windowStartMinute ?? prev.dailyStartMinute ?? 0
  const endHour = windowEndHour ?? prev.windowEndHour ?? ((startHour + SESSION_HOURS) % 24)
  const endMinute = windowEndMinute ?? prev.windowEndMinute ?? 0

  const windowCfg = {
    windowStartHour: startHour,
    windowStartMinute: startMinute,
    windowEndHour: endHour,
    windowEndMinute: endMinute,
    dailyStartHour: startHour,
    dailyStartMinute: startMinute,
  }
  const sessionEndsAt = computeSessionEndsAtFromWindow(windowCfg)
  const label = formatWindowLabel(windowCfg)
  const ts = admin.firestore.FieldValue.serverTimestamp()

  await patchSupervisorConfig({
    enabled: true,
    recurringDaily: true,
    automationUserId: userId,
    ...windowCfg,
    sessionStartedAt: ts,
    sessionEndsAt,
    nextRunAt: ts,
    phase: 'starting',
    itemsProcessedSession: 0,
    lastAutoStartDate: todayKey,
    currentActivity: {
      phase: 'starting',
      message: auto
        ? `Janela ${label} iniciada — só Moderação…`
        : 'Iniciando sessão — primeiro item em instantes…',
      updatedAt: ts,
    },
    lastMessage: auto
      ? `Sessão automática na janela ${label}`
      : `Agenda ${label} (seg–dom) — fiscalizando Moderação…`,
  })
}

async function ensureWaitingDailyPhase(data = {}) {
  const label = formatWindowLabel(data)
  const message = isWithinScheduleWindow(data)
    ? `Aguardando retorno na janela ${label}`
    : `Fora do horário — online ${label} (seg–dom)`

  if (data.phase === 'waiting_daily' && data.lastMessage === message) return

  await patchSupervisorConfig({
    enabled: false,
    phase: 'waiting_daily',
    lastMessage: message,
    currentActivity: {
      phase: 'waiting_daily',
      message,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  })
}

async function endSupervisorSession({ phase = 'completed', message, keepRecurring = true } = {}) {
  const snap = await configRef().get()
  const data = snap.exists ? snap.data() : {}
  const recurring = keepRecurring && Boolean(data.recurringDaily)
  const label = formatWindowLabel(data)
  const finalMessage =
    message ||
    (recurring
      ? `Sessão encerrada — próxima na janela ${label} (seg–dom)`
      : 'Fiscalização concluída.')

  await patchSupervisorConfig({
    enabled: false,
    recurringDaily: recurring,
    phase: recurring ? 'waiting_daily' : phase,
    lastMessage: finalMessage,
    currentActivity: {
      phase: recurring ? 'waiting_daily' : phase,
      message: finalMessage,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  })
}

function isSessionActive(data = {}) {
  if (!data.enabled) return false
  // Agenda com janela: precisa estar dentro do horário E antes do sessionEndsAt
  if (data.recurringDaily && !isWithinScheduleWindow(data)) return false
  const ends = data.sessionEndsAt?.toDate?.()
  if (!ends) return false
  return Date.now() < ends.getTime()
}

async function loadSupervisorConfig() {
  const snap = await configRef().get()
  const data = snap.exists ? snap.data() : {}
  return {
    enabled: Boolean(data.enabled),
    automationUserId: data.automationUserId || null,
    sessionStartedAt: data.sessionStartedAt || null,
    sessionEndsAt: data.sessionEndsAt || null,
    nextRunAt: data.nextRunAt || null,
    phase: data.phase || 'idle',
    currentActivity: data.currentActivity || null,
    itemsProcessedSession: data.itemsProcessedSession || 0,
    lastRunAt: data.lastRunAt || null,
    lastMessage: data.lastMessage || '',
    queueSize: data.queueSize || 0,
    sessionActive: isSessionActive(data),
    recurringDaily: Boolean(data.recurringDaily),
    dailyStartHour: data.dailyStartHour ?? null,
    dailyStartMinute: data.dailyStartMinute ?? null,
    windowStartHour: data.windowStartHour ?? data.dailyStartHour ?? null,
    windowStartMinute: data.windowStartMinute ?? data.dailyStartMinute ?? null,
    windowEndHour: data.windowEndHour ?? null,
    windowEndMinute: data.windowEndMinute ?? null,
    lastAutoStartDate: data.lastAutoStartDate || null,
  }
}

async function patchSupervisorConfig(patch) {
  await configRef().set(
    {
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

async function updateSupervisorActivity(activityPatch = {}) {
  const ts = admin.firestore.FieldValue.serverTimestamp()
  await patchSupervisorConfig({
    phase: activityPatch.phase || 'running',
    currentActivity: {
      ...activityPatch,
      updatedAt: ts,
    },
    lastMessage: activityPatch.message || undefined,
  })
}

async function scheduleNextRun(minutes = INTERVAL_MINUTES) {
  const delayMs = minutes <= 0 ? 5000 : minutes * 60 * 1000
  const nextRunAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + delayMs))
  const waitLabel =
    minutes <= 0 ? 'em instantes' : `~${minutes} min`
  await patchSupervisorConfig({
    nextRunAt,
    phase: 'waiting_next',
    currentActivity: {
      phase: 'waiting_next',
      message: `Aguardando próximo item (${waitLabel})…`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    lastMessage: `Próximo item ${waitLabel}`,
  })
}

async function incrementSessionCounter() {
  const cfg = await loadSupervisorConfig()
  await patchSupervisorConfig({
    itemsProcessedSession: (cfg.itemsProcessedSession || 0) + 1,
  })
}

function queueRef(itemId) {
  return getDb().doc(`professorSupervisorQueue/${itemId}`)
}

function buildDedupeKey(item) {
  return `${item.courseId}:${item.itemType}:${item.payload?.topicKey || item.payload?.flagId || item.payload?.scope || 'all'}`
}

async function queueItemExists(dedupeKey) {
  const snap = await getDb()
    .collection('professorSupervisorQueue')
    .where('dedupeKey', '==', dedupeKey)
    .where('status', 'in', ['pending', 'processing'])
    .limit(1)
    .get()
  return !snap.empty
}

async function enqueueItem(item) {
  const dedupeKey = buildDedupeKey(item)
  if (await queueItemExists(dedupeKey)) return null

  const ref = getDb().collection('professorSupervisorQueue').doc()
  const ts = admin.firestore.FieldValue.serverTimestamp()
  await ref.set({
    ...item,
    dedupeKey,
    status: 'pending',
    createdAt: ts,
    updatedAt: ts,
  })
  return ref.id
}

async function wasRecentlyReviewed(courseId, dedupeKey) {
  const cutoff = Date.now() - REVIEW_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  const snap = await getDb()
    .collection('professorSupervisorHistory')
    .where('courseId', '==', courseId)
    .where('dedupeKey', '==', dedupeKey)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  if (snap.empty) return false
  const reviewedAt = snap.docs[0].data().createdAt?.toDate?.()
  return reviewedAt && reviewedAt.getTime() > cutoff
}

function shuffleInPlace(arr = []) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const TOPIC_QUEUE_STEPS = [
  { itemType: 'topico_flashcards', step: 'flashcards', offset: 2 },
  { itemType: 'topico_digitacao', step: 'digitacao', offset: 1 },
  { itemType: 'topico_material', step: 'material', offset: 0 },
  { itemType: 'topico_questoes', step: 'questoes', offset: -1 },
]

async function enqueueTopicPipeline(courseId, topic, { priorityBase, targetDate, source }) {
  let added = 0
  const basePayload = {
    topicKey: topic.topicKey,
    topicoNome: topic.topicoNome,
    disciplina: topic.disciplina,
    modulo: topic.modulo,
    targetDate,
    source,
  }

  for (const { itemType, step, offset } of TOPIC_QUEUE_STEPS) {
    const dedupeKey = `${courseId}:${itemType}:${topic.topicKey}`
    if (await wasRecentlyReviewed(courseId, dedupeKey)) continue
    const id = await enqueueItem({
      courseId,
      itemType,
      priority: priorityBase + offset,
      payload: { ...basePayload, step },
    })
    if (id) added += 1
  }

  return added
}

async function enqueueBacklogTopics(courseId, todayTopicKeys, edital, todayKey) {
  const db = getDb()
  const statusSnap = await db
    .collection(`courses/${courseId}/topicoStatus`)
    .where('status', '==', 'disponivel')
    .limit(80)
    .get()

  const candidates = []
  for (const doc of statusSnap.docs) {
    const data = doc.data()
    const topicKey = data.topicKey || doc.id
    if (!topicKey || todayTopicKeys.has(topicKey)) continue

    const resolved = resolveTopicFromEdital(edital, topicKey) || {
      topicKey,
      topicoNome: topicKey,
      disciplina: data.disciplinaNome || '',
      modulo: topicKey,
    }

    const readiness = await isTopicContentComplete(courseId, resolved)
    if (!readiness.complete) continue
    candidates.push(resolved)
  }

  shuffleInPlace(candidates)
  let added = 0
  const backlogTopics = BACKLOG_TOPICS_PER_COURSE
    ? candidates.slice(0, BACKLOG_TOPICS_PER_COURSE)
    : candidates
  for (const topic of backlogTopics) {
    added += await enqueueTopicPipeline(courseId, topic, {
      priorityBase: 40,
      targetDate: todayKey,
      source: 'backlog',
    })
  }
  return added
}

async function shouldEnqueueRedacaoTheme(courseId) {
  const db = getDb()
  const guiaSnap = await db.doc(`courses/${courseId}/config/guiaMentorado`).get()
  if (!guiaSnap.exists || !guiaSnap.data()?.hasRedacao) return { ok: false }

  const redacaoSnap = await db.doc(`courses/${courseId}/config/redacao`).get()
  const data = redacaoSnap.exists ? redacaoSnap.data() || {} : {}
  const tema = String(data.tema || '').trim()
  const last =
    data.rotatedAt?.toDate?.() ||
    data.temaRotatedAt?.toDate?.() ||
    data.updatedAt?.toDate?.() ||
    null

  if (!tema) {
    return { ok: true, currentTema: '', reason: 'missing_theme' }
  }
  if (!last || Date.now() - last.getTime() >= REDACAO_ROTATE_MS) {
    return { ok: true, currentTema: tema, reason: 'rotate_due' }
  }
  return { ok: false, currentTema: tema }
}

async function enqueueOpenFlagsForAllCourses() {
  const db = getDb()
  let added = 0
  const coursesSnap = await db.collection('courses').get()

  for (const courseDoc of coursesSnap.docs) {
    const courseId = courseDoc.id
    if (courseDoc.data()?.active === false) continue

    const flagsSnap = await db
      .collection(`courses/${courseId}/contentFeedback`)
      .where('kind', '==', 'flag')
      .where('status', '==', 'open')
      .limit(20)
      .get()

    for (const flagDoc of flagsSnap.docs) {
      const id = await enqueueItem({
        courseId,
        itemType: 'flag',
        priority: 100,
        payload: {
          flagId: flagDoc.id,
          contentType: flagDoc.data().contentType,
          contentId: flagDoc.data().contentId,
          topicKey: flagDoc.data().topicKey || null,
          preview: flagDoc.data().preview || '',
          reportText: flagDoc.data().text || '',
        },
      })
      if (id) added += 1
    }
  }
  return added
}

async function buildQueueItems() {
  const db = getDb()
  let added = 0

  await updateSupervisorActivity({
    phase: 'building_queue',
    message: 'Montando fila — somente sinalizações da Moderação…',
  })

  // Professor IA corrige APENAS a aba Moderação (contentFeedback open flags).
  // Tópicos, véspera e redação NÃO entram nesta fila.
  added += await enqueueOpenFlagsForAllCourses()

  // Cancela itens legados que não são moderação
  try {
    const staleSnap = await db
      .collection('professorSupervisorQueue')
      .where('status', 'in', ['pending', 'error'])
      .limit(100)
      .get()
    for (const staleDoc of staleSnap.docs) {
      const type = staleDoc.data()?.itemType
      if (type && type !== 'flag') {
        await staleDoc.ref.set(
          {
            status: 'cancelled',
            cancelReason: 'professor_moderation_only',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }
    }
  } catch (err) {
    console.warn('[buildQueueItems] limpeza legado:', err?.message || err)
  }

  const pendingSnap = await db
    .collection('professorSupervisorQueue')
    .where('status', '==', 'pending')
    .get()

  await patchSupervisorConfig({ queueSize: pendingSnap.size })
  return { added, queueSize: pendingSnap.size }
}

async function popNextQueueItem() {
  const db = getDb()

  // Somente sinalizações da Moderação
  let snap = { empty: true, docs: [] }
  try {
    snap = await db
      .collection('professorSupervisorQueue')
      .where('status', '==', 'pending')
      .where('itemType', '==', 'flag')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get()
  } catch (err) {
    console.warn('[popNextQueueItem] flag query fallback:', err?.message || err)
    snap = await db
      .collection('professorSupervisorQueue')
      .where('status', '==', 'pending')
      .where('itemType', '==', 'flag')
      .limit(1)
      .get()
  }

  if (snap.empty) return null

  const doc = snap.docs[0]
  await doc.ref.update({
    status: 'processing',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  return { id: doc.id, ...doc.data() }
}

async function finishQueueItem(itemId, status = 'done') {
  await queueRef(itemId).set(
    {
      status,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  const pendingSnap = await getDb()
    .collection('professorSupervisorQueue')
    .where('status', '==', 'pending')
    .get()
  await patchSupervisorConfig({ queueSize: pendingSnap.size })
}

async function spawnSupervisorJob(userId, courseId, queueItem) {
  const db = getDb()
  const ref = db.collection(`users/${userId}/generationJobs`).doc()
  const ts = admin.firestore.FieldValue.serverTimestamp()

  await ref.set({
    userId,
    courseId,
    jobType: 'professor_supervisor',
    topicKey: queueItem.payload?.topicKey || null,
    metadata: { queueItemId: queueItem.id, itemType: queueItem.itemType },
    runOnServer: true,
    serverPayload: {
      queueItemId: queueItem.id,
      itemType: queueItem.itemType,
      payload: queueItem.payload || {},
    },
    status: 'pending',
    progress: 0,
    message: 'Professor fiscalizador — aguardando…',
    createdAt: ts,
    updatedAt: ts,
  })

  return ref.id
}

function itemLabel(item) {
  const nome = item.payload?.topicoNome || item.payload?.topicKey
  if (item.itemType === 'topico_flashcards') return `${nome} — flashcards`
  if (item.itemType === 'topico_digitacao') return `${nome} — digitação (script)`
  if (item.itemType === 'topico_material') return `${nome} — material`
  if (item.itemType === 'topico_questoes') return `${nome} — questões`
  if (item.itemType === 'topico_pipeline') return `${nome} — pipeline`
  if (item.itemType === 'topico') return nome || 'tópico'
  if (item.itemType === 'flag') return `Sinalização (${item.payload?.contentType || 'conteúdo'})`
  if (item.itemType === 'vespera') return 'Véspera de prova'
  if (item.itemType === 'redacao') return 'Redação'
  return item.itemType
}

async function tickProfessorSupervisor({ force = false } = {}) {
  const snap = await configRef().get()
  let data = snap.exists ? snap.data() : {}

  if (data.recurringDaily && data.automationUserId && !data.enabled) {
    if (shouldStartDailySession(data)) {
      await startSupervisorSession(data.automationUserId, { auto: true })
      const refreshed = await configRef().get()
      data = refreshed.exists ? refreshed.data() : {}
      force = true
    } else {
      await ensureWaitingDailyPhase(data)
      return { skipped: true, reason: 'waiting_daily' }
    }
  }

  if (!data.enabled || !data.automationUserId) {
    return { skipped: true, reason: 'disabled' }
  }

  if (!isSessionActive(data)) {
    await endSupervisorSession({
      phase: 'session_expired',
      message: data.recurringDaily
        ? `Janela encerrada — próxima em ${formatWindowLabel(data)} (seg–dom)`
        : 'Sessão encerrada.',
      keepRecurring: Boolean(data.recurringDaily),
    })
    return { skipped: true, reason: 'session_expired' }
  }

  if (!force) {
    const nextRun = data.nextRunAt?.toDate?.()
    if (nextRun && nextRun.getTime() > Date.now()) {
      const waitMin = Math.ceil((nextRun.getTime() - Date.now()) / 60000)
      await patchSupervisorConfig({
        phase: 'waiting_next',
        lastMessage: `Próximo item em ~${waitMin} min`,
      })
      return { skipped: true, reason: 'waiting_interval', waitMin }
    }
  }

  const { hasAvailableGeminiKey } = require('./generationJobResume')
  const itemPeek = await getDb()
    .collection('professorSupervisorQueue')
    .where('status', '==', 'pending')
    .where('itemType', '==', 'flag')
    .limit(1)
    .get()
  const nextItemType = itemPeek.empty ? null : itemPeek.docs[0].data().itemType
  const needsApi = Boolean(nextItemType)

  if (needsApi) {
    const apiReady = await hasAvailableGeminiKey()
    if (!apiReady) {
      await updateSupervisorActivity({
        phase: 'waiting_api',
        message: 'API indisponível — aguardando chaves…',
      })
      return { skipped: true, reason: 'api_unavailable' }
    }
  }

  const activeSnap = await getDb()
    .collection('generationActiveJobs')
    .where('jobType', '==', 'professor_supervisor')
    .limit(3)
    .get()
  if (!activeSnap.empty) {
    const { hasFreshActiveHeartbeat, clearActiveJob } = require('./generationJobResume')
    let hasFresh = false
    for (const activeDoc of activeSnap.docs) {
      if (await hasFreshActiveHeartbeat(activeDoc.id)) {
        hasFresh = true
      } else {
        // Job zumbi — libera a fila
        await clearActiveJob(activeDoc.id)
      }
    }
    if (hasFresh) {
      return { skipped: true, reason: 'already_running' }
    }
  }

  let pendingSnap = await getDb()
    .collection('professorSupervisorQueue')
    .where('status', '==', 'pending')
    .limit(1)
    .get()

  // Sempre tenta enfileirar sinalizações abertas (mesmo com fila de tópicos pendente)
  try {
    const flagsAdded = await enqueueOpenFlagsForAllCourses()
    if (flagsAdded > 0) {
      pendingSnap = await getDb()
        .collection('professorSupervisorQueue')
        .where('status', '==', 'pending')
        .limit(1)
        .get()
    }
  } catch (err) {
    console.warn('[tickProfessorSupervisor] enqueue flags:', err?.message || err)
  }

  let rebuildAdded = 0
  if (pendingSnap.empty) {
    const rebuild = await buildQueueItems()
    rebuildAdded = rebuild.added || 0
    pendingSnap = await getDb()
      .collection('professorSupervisorQueue')
      .where('status', '==', 'pending')
      .limit(1)
      .get()
  }

  if (pendingSnap.empty) {
    // Na janela de Moderação: fica em espera (não encerra o dia) — evita gastar API e
    // permite pegar novas sinalizações quando aparecerem.
    if (data.recurringDaily && isWithinScheduleWindow(data)) {
      await updateSupervisorActivity({
        phase: 'idle',
        message: 'Nenhuma sinalização na Moderação — aguardando novos reports…',
      })
      await scheduleNextRun(INTERVAL_MINUTES)
      return { skipped: true, reason: 'empty_queue_waiting_flags' }
    }

    if (rebuildAdded === 0) {
      await endSupervisorSession({
        keepRecurring: Boolean(data.recurringDaily),
      })
      return { skipped: true, reason: 'session_complete' }
    }

    await updateSupervisorActivity({
      phase: 'idle',
      message: 'Fila vazia — nada a fiscalizar agora.',
    })
    await scheduleNextRun(INTERVAL_MINUTES)
    return { skipped: true, reason: 'empty_queue' }
  }

  const item = await popNextQueueItem()
  if (!item) return { skipped: true, reason: 'pop_failed' }

  const label = itemLabel(item)
  const jobId = await spawnSupervisorJob(data.automationUserId, item.courseId, item)
  await incrementSessionCounter()

  await updateSupervisorActivity({
    phase: 'running',
    jobId,
    itemType: item.itemType,
    courseId: item.courseId,
    label,
    professorStep: 'iniciando',
    message: `Fiscalizando: ${label}`,
    progress: 5,
  })

  await patchSupervisorConfig({
    lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: `Fiscalizando ${item.itemType} — ${label}`,
  })

  return { started: true, jobId, itemId: item.id, itemType: item.itemType, label }
}

function scheduleNextRunForItem(itemType) {
  // Encadeia rápido na sessão (não espera 5 min entre itens)
  if (itemType === 'topico_digitacao' || itemType === 'flag') {
    return scheduleNextRun(0)
  }
  return scheduleNextRun(0)
}

/**
 * Dispara o próximo item imediatamente (após um job terminar).
 * Evita depender só do cron de 5 minutos.
 */
async function kickNextSupervisorItem() {
  await scheduleNextRun(0)
  return tickProfessorSupervisor({ force: true })
}

module.exports = {
  SESSION_MS,
  INTERVAL_MS,
  isSessionActive,
  isWithinScheduleWindow,
  loadSupervisorConfig,
  patchSupervisorConfig,
  updateSupervisorActivity,
  scheduleNextRun,
  scheduleNextRunForItem,
  kickNextSupervisorItem,
  buildQueueItems,
  enqueueOpenFlagsForAllCourses,
  shouldEnqueueRedacaoTheme,
  REDACAO_ROTATE_DAYS,
  popNextQueueItem,
  finishQueueItem,
  tickProfessorSupervisor,
  spawnSupervisorJob,
  startSupervisorSession,
}
