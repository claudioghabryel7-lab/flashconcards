const admin = require('firebase-admin')
const { getTodayKeyInSaoPaulo } = require('./guiaMentoradoShared')
const { loadCronogramaDay } = require('./guiaMentoradoDaily')
const { loadEditalVerticalizado, extractTopicsFromCronogramaDay, resolveTopicFromEdital } = require('./guiaMentoradoEdital')
const { isTopicContentComplete } = require('./guiaMentoradoAutomation')
const { sanitizeTopicKeyForFirestore } = require('./topicKeyUtils')
const { SESSION_HOURS, INTERVAL_MINUTES, REVIEW_COOLDOWN_DAYS } = require('./professorSupervisorShared')

const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000
const BACKLOG_TOPICS_PER_COURSE = null
const DIGITACAO_INTERVAL_MINUTES = 0

function getDb() {
  return admin.firestore()
}

function configRef() {
  return getDb().doc('config/professorFiscalizador')
}

function isSessionActive(data = {}) {
  if (!data.enabled) return false
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
  const delayMs = minutes <= 0 ? 15000 : minutes * 60 * 1000
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

async function buildQueueItems() {
  const db = getDb()
  const todayKey = getTodayKeyInSaoPaulo()
  const isMonday = new Date().getDay() === 1
  let added = 0

  await updateSupervisorActivity({
    phase: 'building_queue',
    message: 'Montando fila de fiscalização…',
  })

  const coursesSnap = await db.collection('courses').where('active', '!=', false).limit(40).get()

  for (const courseDoc of coursesSnap.docs) {
    const courseId = courseDoc.id

    const flagsSnap = await db
      .collection(`courses/${courseId}/contentFeedback`)
      .where('kind', '==', 'flag')
      .where('status', '==', 'open')
      .limit(5)
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

    const mentoradoSnap = await db.doc(`courses/${courseId}/config/guiaMentorado`).get()
    if (mentoradoSnap.exists && mentoradoSnap.data().autoGerarConteudo) {
      const dayEntry = await loadCronogramaDay(courseId, todayKey)
      if (dayEntry) {
        const tipo = dayEntry.type || dayEntry.tipo || 'estudo'
        if (tipo !== 'simulado' && tipo !== 'descanso') {
          const edital = await loadEditalVerticalizado(courseId)
          const topics = extractTopicsFromCronogramaDay(
            { data: todayKey, tipo, materias: dayEntry.materias || [] },
            edital,
          )
          const todayTopicKeys = new Set(topics.map((t) => t.topicKey))
          for (const topic of topics) {
            const readiness = await isTopicContentComplete(courseId, topic)
            const statusSnap = await db
              .doc(`courses/${courseId}/topicoStatus/${sanitizeTopicKeyForFirestore(topic.topicKey)}`)
              .get()
            const published =
              statusSnap.exists && statusSnap.data().status === 'disponivel' && readiness.complete
            if (!published) continue

            added += await enqueueTopicPipeline(courseId, topic, {
              priorityBase: 50,
              targetDate: todayKey,
              source: 'cronograma',
            })
          }

          added += await enqueueBacklogTopics(courseId, todayTopicKeys, edital, todayKey)
        }
      }
    } else if (mentoradoSnap.exists) {
      const edital = await loadEditalVerticalizado(courseId)
      added += await enqueueBacklogTopics(courseId, new Set(), edital, todayKey)
    }

    const vesperaSnap = await db.doc(`courses/${courseId}/vesperaDeProva/material`).get()
    if (vesperaSnap.exists) {
      const dedupeKey = `${courseId}:vespera:material`
      if (!(await wasRecentlyReviewed(courseId, dedupeKey))) {
        const id = await enqueueItem({
          courseId,
          itemType: 'vespera',
          priority: 30,
          payload: { scope: 'material' },
        })
        if (id) added += 1
      }
    }

    if (isMonday) {
      const redacaoSnap = await db.doc(`courses/${courseId}/config/redacao`).get()
      const dedupeKey = `${courseId}:redacao:${todayKey}`
      if (!(await wasRecentlyReviewed(courseId, dedupeKey))) {
        const id = await enqueueItem({
          courseId,
          itemType: 'redacao',
          priority: 60,
          payload: {
            rotateTheme: true,
            targetDate: todayKey,
            currentTema: redacaoSnap.exists ? redacaoSnap.data().tema || '' : '',
          },
        })
        if (id) added += 1
      }
    }
  }

  const pendingSnap = await db
    .collection('professorSupervisorQueue')
    .where('status', '==', 'pending')
    .get()

  await patchSupervisorConfig({ queueSize: pendingSnap.size })
  return { added, queueSize: pendingSnap.size }
}

async function popNextQueueItem() {
  const snap = await getDb()
    .collection('professorSupervisorQueue')
    .where('status', '==', 'pending')
    .orderBy('priority', 'desc')
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get()

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
  if (item.itemType === 'topico') return nome || 'tópico'
  if (item.itemType === 'flag') return `Sinalização (${item.payload?.contentType || 'conteúdo'})`
  if (item.itemType === 'vespera') return 'Véspera de prova'
  if (item.itemType === 'redacao') return 'Redação'
  return item.itemType
}

async function tickProfessorSupervisor({ force = false } = {}) {
  const snap = await configRef().get()
  const data = snap.exists ? snap.data() : {}

  if (!data.enabled || !data.automationUserId) {
    return { skipped: true, reason: 'disabled' }
  }

  if (!isSessionActive(data)) {
    await patchSupervisorConfig({
      phase: 'session_expired',
      lastMessage: 'Sessão de 8h encerrada — clique Ativar para nova sessão.',
      currentActivity: {
        phase: 'session_expired',
        message: 'Sessão de 8h encerrada',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
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
    .orderBy('priority', 'desc')
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get()
  const nextItemType = itemPeek.empty ? null : itemPeek.docs[0].data().itemType
  const needsApi = nextItemType !== 'topico_digitacao'

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
    .limit(1)
    .get()
  if (!activeSnap.empty) {
    return { skipped: true, reason: 'already_running' }
  }

  let pendingSnap = await getDb()
    .collection('professorSupervisorQueue')
    .where('status', '==', 'pending')
    .limit(1)
    .get()

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
    if (rebuildAdded === 0) {
      await patchSupervisorConfig({
        enabled: false,
        phase: 'completed',
        lastMessage: 'Fiscalização concluída — todos os itens já revisados.',
        currentActivity: {
          phase: 'completed',
          message: 'Sessão encerrada — nada pendente para fiscalizar.',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
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
  if (itemType === 'topico_digitacao') {
    return scheduleNextRun(DIGITACAO_INTERVAL_MINUTES)
  }
  return scheduleNextRun(INTERVAL_MINUTES)
}

module.exports = {
  SESSION_MS,
  INTERVAL_MS,
  isSessionActive,
  loadSupervisorConfig,
  patchSupervisorConfig,
  updateSupervisorActivity,
  scheduleNextRun,
  scheduleNextRunForItem,
  buildQueueItems,
  popNextQueueItem,
  finishQueueItem,
  tickProfessorSupervisor,
  spawnSupervisorJob,
}
