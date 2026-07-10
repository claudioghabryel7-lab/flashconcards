const admin = require('firebase-admin')
const { getTodayKeyInSaoPaulo } = require('./guiaMentoradoShared')
const { loadCronogramaDay } = require('./guiaMentoradoDaily')
const { loadEditalVerticalizado, extractTopicsFromCronogramaDay } = require('./guiaMentoradoEdital')
const { isTopicContentComplete } = require('./guiaMentoradoAutomation')
const { sanitizeTopicKeyForFirestore } = require('./topicKeyUtils')
const { MAX_ITEMS_PER_DAY, REVIEW_COOLDOWN_DAYS } = require('./professorSupervisorShared')

function getDb() {
  return admin.firestore()
}

function configRef() {
  return getDb().doc('config/professorFiscalizador')
}

async function loadSupervisorConfig() {
  const snap = await configRef().get()
  const data = snap.exists ? snap.data() : {}
  const todayKey = getTodayKeyInSaoPaulo()
  let itemsProcessedToday = data.itemsProcessedToday || 0
  if (data.counterDate !== todayKey) {
    itemsProcessedToday = 0
  }
  return {
    enabled: Boolean(data.enabled),
    automationUserId: data.automationUserId || null,
    maxItemsPerDay: data.maxItemsPerDay || MAX_ITEMS_PER_DAY,
    itemsProcessedToday,
    counterDate: todayKey,
    lastRunAt: data.lastRunAt || null,
    lastMessage: data.lastMessage || '',
    queueSize: data.queueSize || 0,
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

async function incrementDailyCounter() {
  const cfg = await loadSupervisorConfig()
  await patchSupervisorConfig({
    itemsProcessedToday: cfg.itemsProcessedToday + 1,
    counterDate: cfg.counterDate,
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

async function buildQueueItems() {
  const db = getDb()
  const todayKey = getTodayKeyInSaoPaulo()
  const isMonday = new Date().getDay() === 1
  let added = 0

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
          for (const topic of topics) {
            const readiness = await isTopicContentComplete(courseId, topic)
            const statusSnap = await db
              .doc(`courses/${courseId}/topicoStatus/${sanitizeTopicKeyForFirestore(topic.topicKey)}`)
              .get()
            const published =
              statusSnap.exists && statusSnap.data().status === 'disponivel' && readiness.complete
            if (!published) continue

            const dedupeKey = `${courseId}:topico:${topic.topicKey}`
            if (await wasRecentlyReviewed(courseId, dedupeKey)) continue
            const id = await enqueueItem({
              courseId,
              itemType: 'topico',
              priority: 50,
              payload: {
                topicKey: topic.topicKey,
                topicoNome: topic.topicoNome,
                disciplina: topic.disciplina,
                modulo: topic.modulo,
                targetDate: todayKey,
              },
            })
            if (id) added += 1
          }
        }
      }
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
          priority: isMonday ? 60 : 20,
          payload: {
            rotateTheme: isMonday,
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

async function tickProfessorSupervisor() {
  const cfg = await loadSupervisorConfig()
  if (!cfg.enabled || !cfg.automationUserId) {
    return { skipped: true, reason: 'disabled' }
  }
  if (cfg.itemsProcessedToday >= cfg.maxItemsPerDay) {
    return { skipped: true, reason: 'daily_limit' }
  }

  const { hasAvailableGeminiKey } = require('./generationJobResume')
  const apiReady = await hasAvailableGeminiKey()
  if (!apiReady) {
    await patchSupervisorConfig({ lastMessage: 'API indisponível — aguardando chaves…' })
    return { skipped: true, reason: 'api_unavailable' }
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

  if (pendingSnap.empty) {
    await buildQueueItems()
    pendingSnap = await getDb()
      .collection('professorSupervisorQueue')
      .where('status', '==', 'pending')
      .limit(1)
      .get()
  }

  if (pendingSnap.empty) {
    await patchSupervisorConfig({ lastMessage: 'Fila vazia — nada a fiscalizar agora.' })
    return { skipped: true, reason: 'empty_queue' }
  }

  const item = await popNextQueueItem()
  if (!item) return { skipped: true, reason: 'pop_failed' }

  const jobId = await spawnSupervisorJob(cfg.automationUserId, item.courseId, item)
  await incrementDailyCounter()
  await patchSupervisorConfig({
    lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: `Fiscalizando ${item.itemType} — ${item.courseId}`,
  })

  return { started: true, jobId, itemId: item.id, itemType: item.itemType }
}

module.exports = {
  loadSupervisorConfig,
  patchSupervisorConfig,
  buildQueueItems,
  popNextQueueItem,
  finishQueueItem,
  tickProfessorSupervisor,
  spawnSupervisorJob,
}
