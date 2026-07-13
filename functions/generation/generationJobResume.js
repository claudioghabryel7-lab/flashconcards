const admin = require('firebase-admin')
const {
  getAvailableGeminiKeysInOrder,
  silentProbeGeminiKey,
  collectMotherGeminiApiKey,
  isKeyUnavailable,
} = require('./geminiKeyPool')

const JOB_HEARTBEAT_MS = 15 * 1000
const RETRY_INTERVAL_MS = 15 * 1000
const CONCURRENCY_RETRY_MS = 15 * 1000
/** Só considera "sem sinal" após 5 min — geração de IA pode ficar quieta por minutos. */
const STALL_PROGRESS_MS = 5 * 60 * 1000
/** Heartbeat a cada 15s → fresco se < 60s. */
const ACTIVE_HEARTBEAT_FRESH_MS = 60 * 1000
const CF_SAFE_MS = 7 * 60 * 1000

const WAITING_STATUSES = ['waiting_api', 'waiting_retry', 'waiting_timeout']

function stripUndefinedDeep(value) {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value
  if (typeof value.toDate === 'function') return value

  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue
    out[k] = stripUndefinedDeep(v)
  }
  return out
}

function getDb() {
  return admin.firestore()
}

function isApiQuotaError(error) {
  const code = error?.code
  const msg = String(error?.message || '').toLowerCase()
  return (
    code === 'api_quota_exhausted' ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource has been exhausted') ||
    msg.includes('too many requests') ||
    msg.includes('429')
  )
}

function isJobCancelledError(err) {
  return err?.code === 'job_cancelled'
}

/** Erros que devem pausar e retentar (não marcar job como error). */
function isTransientGenerationError(error) {
  if (isApiQuotaError(error)) return true
  if (isJobCancelledError(error)) return false
  const code = error?.code
  const msg = String(error?.message || '').toLowerCase()
  if (
    code === 'ai_empty_response' ||
    code === 'ai_json_parse_error' ||
    code === 'ai_json_truncated' ||
    code === 'cf_timeout' ||
    code === 'material_incomplete'
  ) {
    return true
  }
  if (
    msg.includes('temporár') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('socket') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('500') ||
    msg.includes('504') ||
    msg.includes('unavailable') ||
    msg.includes('internal') ||
    msg.includes('overloaded') ||
    msg.includes('try again') ||
    msg.includes('tente novamente') ||
    msg.includes('falha na geração') ||
    msg.includes('empty') ||
    msg.includes('json')
  ) {
    return true
  }
  if (
    msg.includes('payload') ||
    msg.includes('ausente') ||
    msg.includes('não suportado') ||
    msg.includes('nao suportado') ||
    msg.includes('não autenticado')
  ) {
    return false
  }
  return true
}

function isResumableJob(jobType) {
  return [
    'guia_mentorado_automation',
    'guia_mentorado_cronograma',
    'guia_mentorado_backfill',
    'professor_supervisor',
    'flashcards_topico',
    'questoes_topico',
    'conteudo_completo',
    'conteudo_incidencia',
    'questoes_incidencia',
    'vespera_prova',
    'admin_edital_verticalizado',
    'admin_materia_revisada',
  ].includes(jobType)
}

function isMentoradoJob(jobType) {
  return (
    jobType === 'guia_mentorado_automation' ||
    jobType === 'guia_mentorado_cronograma' ||
    jobType === 'guia_mentorado_backfill' ||
    jobType === 'professor_supervisor'
  )
}

function createJobCancelledError() {
  const err = new Error('Job cancelado pelo admin')
  err.code = 'job_cancelled'
  return err
}

async function throwIfCancelled(userId, jobId) {
  if (await isJobCancelled(userId, jobId)) {
    throw createJobCancelledError()
  }
}

async function isJobCancelled(userId, jobId) {
  const snap = await getDb().doc(`users/${userId}/generationJobs/${jobId}`).get()
  return snap.exists && snap.data().status === 'cancelled'
}

async function touchActiveJob(userId, jobId, patch = {}) {
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const db = getDb()

  await Promise.all([
    db.doc(`generationActiveJobs/${jobId}`).set(
      {
        userId,
        jobId,
        lastHeartbeat: ts,
        ...patch,
      },
      { merge: true },
    ),
    // Mantém o job "vivo" no banner — evita falso "sem sinal" durante chamadas longas à IA
    db
      .doc(`users/${userId}/generationJobs/${jobId}`)
      .update({
        progressUpdatedAt: ts,
        updatedAt: ts,
        lastHeartbeat: ts,
      })
      .catch(() => {}),
  ])
}

/**
 * Atualiza o job sozinho a cada 15s enquanto estiver rodando.
 * Evita falso "travado" / stall recovery durante chamadas longas ou gaps entre lotes.
 * @returns {() => void} stop
 */
function startJobSelfKeepAlive(userId, jobId, intervalMs = JOB_HEARTBEAT_MS) {
  let stopped = false
  let tick = 0
  let inFlight = false

  const beat = () => {
    if (stopped || inFlight) return
    inFlight = true
    Promise.resolve()
      .then(async () => {
        if (stopped) return
        if (await isJobCancelled(userId, jobId)) return
        tick += 1
        await touchActiveJob(userId, jobId, {
          status: 'running',
          keepAlive: true,
          keepAliveTick: tick,
        })
      })
      .catch(() => {})
      .finally(() => {
        inFlight = false
      })
  }

  // Primeiro ping imediato + intervalo fixo
  beat()
  const timer = setInterval(beat, Math.max(5000, intervalMs))

  return () => {
    stopped = true
    clearInterval(timer)
  }
}

async function hasFreshActiveHeartbeat(jobId, freshMs = ACTIVE_HEARTBEAT_FRESH_MS) {
  const snap = await getDb().doc(`generationActiveJobs/${jobId}`).get()
  if (!snap.exists) return false
  const hb = snap.data().lastHeartbeat?.toDate?.()
  if (!hb) return false
  return Date.now() - hb.getTime() < freshMs
}

async function clearActiveJob(jobId) {
  await getDb().doc(`generationActiveJobs/${jobId}`).delete().catch(() => {})
}

async function pauseJobForResume({
  userId,
  jobId,
  courseId,
  jobType,
  serverPayload,
  resumeFromTopicIndex = 0,
  topicLabel = '',
  updateJob,
  status = 'waiting_retry',
  message,
  waitReason = 'retry',
  retryDelayMs = RETRY_INTERVAL_MS,
}) {
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const nextRetryAt = new Date(Date.now() + Math.max(0, retryDelayMs))

  const resumeState = {
    resumeFromTopicIndex,
    targetDate: serverPayload?.targetDate || null,
    topicLabel,
    waitReason,
  }

  const defaultMessages = {
    waiting_api: topicLabel
      ? `API expirada — aguardando… (${topicLabel})`
      : 'API expirada — aguardando liberação das chaves…',
    waiting_timeout: topicLabel
      ? `Pausado (limite do servidor) — retomando… (${topicLabel})`
      : 'Pausado (limite do servidor) — retomando em instantes…',
    waiting_retry: topicLabel
      ? `Aguardando para retomar… (${topicLabel})`
      : 'Aguardando para retomar a geração…',
  }

  const finalMessage = message || defaultMessages[status] || defaultMessages.waiting_retry
  const lastError = (() => {
    const m = String(message || '')
    const open = m.lastIndexOf('(')
    const close = m.lastIndexOf(')')
    if (open === -1 || close <= open) return null
    const extracted = m.slice(open + 1, close).trim()
    return extracted && !extracted.includes('tentativa') ? extracted : null
  })()

  await updateJob(userId, jobId, {
    status,
    message: finalMessage,
    resumeState,
    waitReason,
    nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetryAt),
    ...(lastError ? { lastError } : {}),
  })

  await getDb().doc(`generationResumeQueue/${jobId}`).set(
    stripUndefinedDeep({
      userId,
      jobId,
      courseId,
      jobType,
      serverPayload: stripUndefinedDeep(serverPayload || {}),
      resumeState,
      status,
      waitReason,
      nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetryAt),
      updatedAt: ts,
      createdAt: ts,
    }),
  )

  // Jobs aguardando retomada não ocupam slot de concorrência.
  await clearActiveJob(jobId)
}

async function touchJobHeartbeat(userId, jobId, patch = {}) {
  const ts = admin.firestore.FieldValue.serverTimestamp()
  await getDb()
    .doc(`users/${userId}/generationJobs/${jobId}`)
    .update({
      ...patch,
      updatedAt: ts,
      progressUpdatedAt: ts,
    })
}

async function touchWaitingJobOnNudge(userId, jobId, jobData) {
  const attempt = Math.max(0, Number(jobData.nudgeAttempt) || 0) + 1
  const lastError = jobData.lastError || null
  const topicLabel = jobData.resumeState?.topicLabel || ''

  let message = 'Retomando automaticamente…'
  if (jobData.status === 'waiting_api') {
    message = topicLabel
      ? `API indisponível — tentativa ${attempt} (${topicLabel})`
      : `API indisponível — tentativa ${attempt}, verificando a cada 15s…`
  } else if (jobData.status === 'waiting_timeout') {
    message = topicLabel
      ? `Pausado (servidor) — tentativa ${attempt} (${topicLabel})`
      : `Pausado (servidor) — tentativa ${attempt}, retomando a cada 15s…`
  } else if (lastError) {
    message = `Erro temporário — tentativa ${attempt} a cada 15s… (${lastError})`
  } else if (topicLabel) {
    message = `Aguardando retomada — tentativa ${attempt} (${topicLabel})`
  } else {
    message = `Aguardando retomada — tentativa ${attempt} a cada 15s…`
  }

  await touchJobHeartbeat(userId, jobId, {
    nudgeAttempt: attempt,
    message,
  })

  await getDb()
    .doc(`generationResumeQueue/${jobId}`)
    .set(
      {
        nextRetryAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

  return { attempt, message }
}

async function pauseJobForApi(params) {
  return pauseJobForResume({ ...params, status: 'waiting_api', waitReason: 'api' })
}

async function hasAvailableGeminiKey() {
  // Só sonda chaves livres — não fica re-testando a mesma expirada/ocupada a cada 5s.
  const keys = getAvailableGeminiKeysInOrder()
  for (const key of keys) {
    const ok = await silentProbeGeminiKey(key)
    if (ok) return true
  }
  const mother = collectMotherGeminiApiKey()
  if (mother && !keys.includes(mother) && !isKeyUnavailable(mother)) {
    return silentProbeGeminiKey(mother)
  }
  return false
}

async function bumpResumeRetry(jobId, delayMs = RETRY_INTERVAL_MS) {
  const nextRetryAt = new Date(Date.now() + Math.max(0, delayMs))
  const ts = admin.firestore.Timestamp.fromDate(nextRetryAt)
  await getDb().doc(`generationResumeQueue/${jobId}`).set(
    { nextRetryAt: ts, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  )
}

async function clearResumeQueue(jobId) {
  await getDb().doc(`generationResumeQueue/${jobId}`).delete().catch(() => {})
  await clearActiveJob(jobId)
}

function shouldCheckpointTimeout(jobStartedAt) {
  return Date.now() - jobStartedAt >= CF_SAFE_MS
}

async function handleGenerationJobCancelled(userId, jobId, jobData = {}) {
  await clearResumeQueue(jobId)

  const courseId = jobData.courseId
  const targetDate =
    jobData.serverPayload?.targetDate || jobData.resumeState?.targetDate || null

  if (
    courseId &&
    targetDate &&
    (jobData.jobType === 'guia_mentorado_automation' ||
      jobData.jobType === 'guia_mentorado_backfill')
  ) {
    const { resetGeneratingTopicsOnCancel } = require('./guiaMentoradoStatus')
    await resetGeneratingTopicsOnCancel(courseId, targetDate)
  }
}

/** Cancela job no servidor — limpa fila de retomada e libera slot ativo. */
async function cancelGenerationJob(userId, jobId) {
  const db = getDb()
  const jobRef = db.doc(`users/${userId}/generationJobs/${jobId}`)
  const snap = await jobRef.get()
  if (!snap.exists) return { ok: false, reason: 'not_found' }

  const jobData = snap.data()
  if (jobData.status === 'cancelled') {
    await clearResumeQueue(jobId)
    return { ok: true, reason: 'already_cancelled' }
  }

  const ts = admin.firestore.FieldValue.serverTimestamp()
  await jobRef.update({
    status: 'cancelled',
    progress: 100,
    message: 'Cancelado pelo admin',
    finishedAt: ts,
    updatedAt: ts,
    progressUpdatedAt: ts,
  })

  await handleGenerationJobCancelled(userId, jobId, jobData)
  return { ok: true, jobId, jobType: jobData.jobType }
}

async function cancelAllGenerationJobs(userId) {
  const db = getDb()
  const snap = await db
    .collection(`users/${userId}/generationJobs`)
    .where('status', 'in', ['pending', 'running', ...WAITING_STATUSES])
    .get()

  if (snap.empty) return { ok: true, cancelled: 0 }

  const results = await Promise.allSettled(
    snap.docs.map((d) => cancelGenerationJob(userId, d.id)),
  )

  const cancelled = results.filter(
    (r) => r.status === 'fulfilled' && r.value?.ok,
  ).length

  return { ok: true, cancelled }
}

/**
 * Cancela TODOS os jobs ativos (qualquer usuário) via generationActiveJobs + fila de retomada.
 * Uso admin: força parada global.
 */
async function cancelAllActiveJobsGlobally() {
  const db = getDb()
  let cancelled = 0

  const activeSnap = await db.collection('generationActiveJobs').get()
  for (const doc of activeSnap.docs) {
    const data = doc.data() || {}
    const userId = data.userId
    const jobId = data.jobId || doc.id
    if (!userId || !jobId) {
      await doc.ref.delete().catch(() => {})
      continue
    }
    try {
      const result = await cancelGenerationJob(userId, jobId)
      if (result?.ok) cancelled += 1
    } catch {
      await clearResumeQueue(jobId)
      await clearActiveJob(jobId)
    }
  }

  const queueSnap = await db.collection('generationResumeQueue').get()
  for (const doc of queueSnap.docs) {
    const data = doc.data() || {}
    const userId = data.userId
    const jobId = data.jobId || doc.id
    if (userId && jobId) {
      try {
        const result = await cancelGenerationJob(userId, jobId)
        if (result?.ok) cancelled += 1
      } catch {
        await clearResumeQueue(jobId)
      }
    } else {
      await doc.ref.delete().catch(() => {})
    }
  }

  return { ok: true, cancelled }
}

async function runWithHeartbeat(work, onHeartbeat, intervalMs = JOB_HEARTBEAT_MS, shouldAbort = null) {
  let active = true
  let abortError = null

  const runAbortCheck = async () => {
    if (abortError) throw abortError
    if (!shouldAbort) return
    if (await shouldAbort()) {
      abortError = createJobCancelledError()
      active = false
      throw abortError
    }
  }

  const timer = setInterval(() => {
    if (!active) return
    Promise.resolve(runAbortCheck())
      .then(() => {
        if (!abortError) return onHeartbeat?.()
      })
      .catch((err) => {
        if (isJobCancelledError(err)) abortError = err
      })
  }, intervalMs)

  try {
    await runAbortCheck()
    const result = await work(runAbortCheck)
    if (abortError) throw abortError
    await runAbortCheck()
    return result
  } finally {
    active = false
    clearInterval(timer)
  }
}

/**
 * Gera JSON com IA mantendo heartbeat do job a cada 15s.
 * Evita falso "sem sinal" / stall durante chamadas longas ao Gemini.
 */
async function generateAiJsonWithJobHeartbeat(
  userId,
  jobId,
  prompt,
  options = {},
  keepAliveMessage = null,
) {
  const { generateAiJson } = require('./geminiServer')
  return runWithHeartbeat(
    () => generateAiJson(prompt, options),
    async () => {
      const ts = admin.firestore.FieldValue.serverTimestamp()
      await Promise.all([
        touchActiveJob(userId, jobId, { status: 'running' }),
        getDb()
          .doc(`users/${userId}/generationJobs/${jobId}`)
          .update({
            progressUpdatedAt: ts,
            updatedAt: ts,
            ...(keepAliveMessage ? { message: keepAliveMessage } : {}),
          })
          .catch(() => {}),
      ])
    },
    JOB_HEARTBEAT_MS,
    async () => isJobCancelled(userId, jobId),
  )
}

function isJobProgressStale(jobData, stallMs = STALL_PROGRESS_MS) {
  const ts = jobData.progressUpdatedAt?.toDate?.() || jobData.updatedAt?.toDate?.()
  if (!ts) return true
  return Date.now() - ts.getTime() >= stallMs
}

function mergeResumeServerPayload(jobData = {}, queueData = {}, resumeFromTopicIndex = 0) {
  const jobPayload = jobData.serverPayload || {}
  const queuePayload = queueData.serverPayload || {}
  const jobType = queueData.jobType || jobData.jobType || ''
  const topics = queuePayload.topics?.length
    ? queuePayload.topics
    : jobPayload.topics?.length
      ? jobPayload.topics
      : null

  const merged = {
    ...jobPayload,
    ...queuePayload,
    courseId: queuePayload.courseId || jobPayload.courseId || jobData.courseId,
    dayKeys: queuePayload.dayKeys || jobPayload.dayKeys,
    resumeFromDayIndex:
      queuePayload.resumeFromDayIndex ?? jobPayload.resumeFromDayIndex ?? 0,
    resumeFromTopicIndex:
      resumeFromTopicIndex ??
      queuePayload.resumeFromTopicIndex ??
      jobPayload.resumeFromTopicIndex ??
      0,
    targetDate: queuePayload.targetDate || jobPayload.targetDate || null,
    autoPublish: queuePayload.autoPublish ?? jobPayload.autoPublish ?? true,
  }

  if (topics?.length) merged.topics = topics
  // Backfill carrega tópicos do cronograma — nunca persistir topics vazio/undefined
  if (jobType === 'guia_mentorado_backfill') {
    delete merged.topics
  }
  return stripUndefinedDeep(merged)
}

async function ensureResumeQueueFromJob(userId, jobId, jobData) {
  const resumeFromTopicIndex =
    jobData.resumeState?.resumeFromTopicIndex ??
    jobData.serverPayload?.resumeFromTopicIndex ??
    0
  const serverPayload = mergeResumeServerPayload(
    jobData,
    { serverPayload: jobData.serverPayload || {} },
    resumeFromTopicIndex,
  )
  const ts = admin.firestore.FieldValue.serverTimestamp()

  await getDb()
    .doc(`generationResumeQueue/${jobId}`)
    .set(
      stripUndefinedDeep({
        userId,
        jobId,
        courseId: jobData.courseId || null,
        jobType: jobData.jobType,
        serverPayload,
        resumeState: jobData.resumeState || {
          resumeFromTopicIndex,
          targetDate: serverPayload.targetDate || null,
          topicLabel: '',
          waitReason: jobData.waitReason || 'retry',
        },
        status: jobData.status,
        waitReason: jobData.waitReason || jobData.resumeState?.waitReason || 'retry',
        nextRetryAt: admin.firestore.Timestamp.now(),
        updatedAt: ts,
      }),
      { merge: true },
    )
}

async function forceResumeJob(userId, jobId, jobData, { waitReason = 'nudge', message } = {}) {
  const resumeFromTopicIndex =
    jobData.resumeState?.resumeFromTopicIndex ??
    jobData.serverPayload?.resumeFromTopicIndex ??
    0

  const db = getDb()
  await pauseJobForResume({
    userId,
    jobId,
    courseId: jobData.courseId,
    jobType: jobData.jobType,
    serverPayload: stripUndefinedDeep({
      ...(jobData.serverPayload || {}),
      resumeFromTopicIndex,
    }),
    resumeFromTopicIndex,
    topicLabel: jobData.resumeState?.topicLabel || '',
    updateJob: async (uid, jid, patch) => {
      await db.doc(`users/${uid}/generationJobs/${jid}`).update(
        stripUndefinedDeep({
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      )
    },
    status: 'waiting_retry',
    waitReason,
    message: message || 'Forçando retomada…',
    retryDelayMs: 0,
  })

  // NÃO esperar a geração — HTTP do nudge precisa responder em <1s
  resumeSingleGenerationJob(jobId, null, userId).catch((err) => {
    console.error(`[forceResumeJob] async ${jobId}:`, err)
  })
  return { ok: true, reason: 'resume_scheduled', resumed: 0 }
}

async function nudgeStalledGenerationJob(userId, jobId) {
  const db = getDb()
  const jobRef = db.doc(`users/${userId}/generationJobs/${jobId}`)
  const jobSnap = await jobRef.get()
  if (!jobSnap.exists) return { ok: false, reason: 'not_found' }

  const jobData = jobSnap.data()
  if (!jobData.runOnServer || !isResumableJob(jobData.jobType)) {
    return { ok: false, reason: 'not_server_job' }
  }
  if (await isJobCancelled(userId, jobId)) {
    return { ok: false, reason: 'cancelled' }
  }

  if (jobData.status === 'running') {
    // Heartbeat fresco = job ainda processando (ex.: chamada Gemini longa). NÃO forçar retomada.
    if (await hasFreshActiveHeartbeat(jobId)) {
      await touchJobHeartbeat(userId, jobId).catch(() => {})
      return { ok: true, reason: 'still_active' }
    }
    if (!isJobProgressStale(jobData)) {
      return { ok: true, reason: 'still_active' }
    }
    return forceResumeJob(userId, jobId, jobData, {
      waitReason: 'nudge_stalled',
      message: 'Sem sinal do servidor — retomando…',
    })
  }

  if (WAITING_STATUSES.includes(jobData.status)) {
    await ensureResumeQueueFromJob(userId, jobId, jobData)
    await touchWaitingJobOnNudge(userId, jobId, jobData)
    resumeSingleGenerationJob(jobId, null, userId).catch((err) => {
      console.error(`[nudgeStalledGenerationJob] resume async ${jobId}:`, err)
    })
    return { ok: true, reason: 'nudge_scheduled', resumed: 0 }
  }

  if (jobData.status === 'pending') {
    await touchJobHeartbeat(userId, jobId, {
      message: 'Enviado ao servidor — aguardando início…',
    })
    const { kickGenerationJob } = require('./generationJobKick')
    const result = await kickGenerationJob(userId, jobId, { wait: false })
    return { ok: true, reason: 'kicked_pending', ...result }
  }

  return { ok: false, reason: 'not_waiting' }
}

async function recoverStalledRunningJobs() {
  const db = getDb()
  const cutoff = Date.now() - STALL_PROGRESS_MS
  const snap = await db.collection('generationActiveJobs').limit(30).get()
  let recovered = 0

  for (const doc of snap.docs) {
    const data = doc.data()
    const heartbeat = data.lastHeartbeat?.toDate?.()
    if (!heartbeat || heartbeat.getTime() > cutoff) continue

    const { userId, jobId } = data
    if (!userId || !jobId) continue

    const jobSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
    if (!jobSnap.exists) {
      await clearActiveJob(jobId)
      continue
    }

    const jobData = jobSnap.data()
    if (jobData.status !== 'running' || !isResumableJob(jobData.jobType)) continue
    if (await isJobCancelled(userId, jobId)) {
      await handleGenerationJobCancelled(userId, jobId, jobData)
      continue
    }

    const resumeFromTopicIndex =
      jobData.resumeState?.resumeFromTopicIndex ??
      jobData.serverPayload?.resumeFromTopicIndex ??
      0

    await pauseJobForResume({
      userId,
      jobId,
      courseId: jobData.courseId,
      jobType: jobData.jobType,
      serverPayload: {
        ...(jobData.serverPayload || {}),
        resumeFromTopicIndex,
      },
      resumeFromTopicIndex,
      topicLabel: jobData.resumeState?.topicLabel || '',
      updateJob: async (uid, jid, patch) => {
        await db.doc(`users/${uid}/generationJobs/${jid}`).update({
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      },
      status: 'waiting_retry',
      waitReason: 'stalled',
      message: 'Geração pausada (sem atualização) — retomando automaticamente…',
    })
    recovered += 1
  }

  return recovered
}

async function resumeSingleGenerationJob(jobId, queueData = null, hintUserId = null) {
  const db = getDb()
  const now = admin.firestore.Timestamp.now()

  async function loadJobForUser(userId) {
    const jobSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
    if (!jobSnap.exists) return null
    return jobSnap.data()
  }

  let data = queueData
  if (!data) {
    const queueSnap = await db.doc(`generationResumeQueue/${jobId}`).get()
    if (!queueSnap.exists) {
      if (!hintUserId) return { resumed: false, reason: 'no_queue' }
      const jobData = await loadJobForUser(hintUserId)
      if (!jobData) return { resumed: false, reason: 'missing_job' }
      if (!WAITING_STATUSES.includes(jobData.status)) {
        return { resumed: false, reason: 'no_queue' }
      }
      await ensureResumeQueueFromJob(hintUserId, jobId, jobData)
      data = (await db.doc(`generationResumeQueue/${jobId}`).get()).data()
    } else {
      data = queueSnap.data()
    }
  }

  if (!data.userId || !data.jobType) {
    const uid = hintUserId || data.userId
    if (uid) {
      const jobData = await loadJobForUser(uid)
      if (jobData) {
        await ensureResumeQueueFromJob(uid, jobId, jobData)
        data = (await db.doc(`generationResumeQueue/${jobId}`).get()).data()
      }
    }
  }

  const nextRetry = data.nextRetryAt
  if (nextRetry && nextRetry.toMillis() > now.toMillis()) {
    return { resumed: false, reason: 'not_due' }
  }

  const { userId, courseId } = data
  if (!userId || !jobId) return { resumed: false, reason: 'invalid_queue' }

  if (await isJobCancelled(userId, jobId)) {
    const cancelledSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
    const cancelledData = cancelledSnap.exists ? cancelledSnap.data() : data
    await handleGenerationJobCancelled(userId, jobId, {
      ...cancelledData,
      courseId: courseId || cancelledData.courseId,
      jobType: cancelledData.jobType || data.jobType,
    })
    return { resumed: false, reason: 'cancelled' }
  }

  const jobRef = db.doc(`users/${userId}/generationJobs/${jobId}`)
  const jobSnap = await jobRef.get()
  if (!jobSnap.exists) {
    await clearResumeQueue(jobId)
    return { resumed: false, reason: 'missing_job' }
  }

  const jobData = jobSnap.data()
  if (!WAITING_STATUSES.includes(jobData.status)) {
    await clearResumeQueue(jobId)
    return { resumed: false, reason: 'not_waiting' }
  }

  if (jobData.status === 'waiting_api') {
    const apiReady = await hasAvailableGeminiKey()
    if (!apiReady) {
      await bumpResumeRetry(jobId)
      return { resumed: false, reason: 'api_not_ready' }
    }
  }

  const effectiveJobType = jobData.jobType || data.jobType
  const resumeFromTopicIndex =
    jobData.resumeState?.resumeFromTopicIndex ??
    data.resumeState?.resumeFromTopicIndex ??
    0

  const serverPayload = mergeResumeServerPayload(jobData, data, resumeFromTopicIndex)
  const ts = admin.firestore.FieldValue.serverTimestamp()

  await jobRef.update(
    stripUndefinedDeep({
      status: 'running',
      message: 'Retomando geração automaticamente…',
      serverPayload,
      updatedAt: ts,
      progressUpdatedAt: ts,
    }),
  )

  await touchActiveJob(userId, jobId, { status: 'running', jobType: effectiveJobType })

  const { processGenerationJob } = require('./jobProcessor')

  try {
    const outcome = await processGenerationJob(userId, jobId, {
      ...jobData,
      courseId: courseId || jobData.courseId,
      jobType: effectiveJobType,
      serverPayload,
    })
    if (!outcome?.paused) {
      await clearResumeQueue(jobId)
    }
    return { resumed: true, jobId, jobType: effectiveJobType, outcome }
  } catch (err) {
    console.error(`[resumeSingleGenerationJob] job ${jobId}:`, err)
    if (await isJobCancelled(userId, jobId)) {
      await handleGenerationJobCancelled(userId, jobId, {
        ...jobData,
        courseId: courseId || jobData.courseId,
        jobType: effectiveJobType,
      })
      return { resumed: false, reason: 'cancelled' }
    }
    if (isResumableJob(effectiveJobType) && isTransientGenerationError(err)) {
      const pauseStatus = isApiQuotaError(err) ? 'waiting_api' : 'waiting_retry'
      await pauseJobForResume({
        userId,
        jobId,
        courseId: courseId || jobData.courseId,
        jobType: effectiveJobType,
        serverPayload,
        resumeFromTopicIndex,
        topicLabel: jobData.resumeState?.topicLabel || '',
        updateJob: async (uid, jid, patch) => {
          await db.doc(`users/${uid}/generationJobs/${jid}`).update(
            stripUndefinedDeep({
              ...patch,
              serverPayload: stripUndefinedDeep(patch.serverPayload || serverPayload),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }),
          )
        },
        status: pauseStatus,
        waitReason: isApiQuotaError(err) ? 'api' : 'error',
        message: isApiQuotaError(err)
          ? 'API indisponível — trocando chave e retomando…'
          : `Erro temporário — tentando outra API em 5s… (${err.message || 'erro'})`,
      })
      return { resumed: false, reason: 'error', error: err.message }
    }

    await jobRef.update({
      status: 'error',
      progress: 100,
      message: err.message || 'Falha ao retomar geração.',
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    await clearResumeQueue(jobId)
    return { resumed: false, reason: 'fatal', error: err.message }
  }
}

async function resumeWaitingGenerationJobs() {
  const db = getDb()
  const now = admin.firestore.Timestamp.now()

  const stalled = await recoverStalledRunningJobs()

  const snap = await db
    .collection('generationResumeQueue')
    .where('nextRetryAt', '<=', now)
    .limit(20)
    .get()

  if (snap.empty) return { resumed: 0, waiting: 0, stalled }

  const needsApi = snap.docs.some((d) => (d.data().status || '') === 'waiting_api')
  if (needsApi) {
    const apiReady = await hasAvailableGeminiKey()
    if (!apiReady) {
      for (const doc of snap.docs) {
        await bumpResumeRetry(doc.id)
      }
      return { resumed: 0, waiting: snap.size, apiReady: false, stalled }
    }
  }

  const { countActiveServerJobs, MAX_CONCURRENT_SERVER_JOBS } = require('./generationJobConcurrency')
  let activeCount = await countActiveServerJobs()
  const candidates = []

  for (const doc of snap.docs) {
    if (activeCount + candidates.length >= MAX_CONCURRENT_SERVER_JOBS) break
    candidates.push(doc)
  }

  if (!candidates.length) {
    return { resumed: 0, waiting: snap.size, stalled, slotsFull: true }
  }

  const results = await Promise.allSettled(
    candidates.map((doc) => resumeSingleGenerationJob(doc.id, doc.data())),
  )

  let resumed = 0
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value?.resumed) resumed += 1
  })

  return { resumed, waiting: snap.size - resumed, stalled, parallel: candidates.length }
}

module.exports = {
  isApiQuotaError,
  isTransientGenerationError,
  isJobCancelled,
  isJobCancelledError,
  isMentoradoJob,
  isResumableJob,
  throwIfCancelled,
  handleGenerationJobCancelled,
  pauseJobForApi,
  pauseJobForResume,
  resumeWaitingGenerationJobs,
  resumeSingleGenerationJob,
  nudgeStalledGenerationJob,
  cancelGenerationJob,
  cancelAllGenerationJobs,
  cancelAllActiveJobsGlobally,
  hasAvailableGeminiKey,
  touchActiveJob,
  clearActiveJob,
  startJobSelfKeepAlive,
  touchJobHeartbeat,
  clearResumeQueue,
  shouldCheckpointTimeout,
  runWithHeartbeat,
  generateAiJsonWithJobHeartbeat,
  CF_SAFE_MS,
  JOB_HEARTBEAT_MS,
  STALL_PROGRESS_MS,
  WAITING_STATUSES,
  stripUndefinedDeep,
}
