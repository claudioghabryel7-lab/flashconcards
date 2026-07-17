const admin = require('firebase-admin')

/** 2 jobs Gemini simultâneos — mentorado + professor/conteúdo em paralelo moderado. */
const MAX_CONCURRENT_SERVER_JOBS = 2
const MAX_CONCURRENT_BACKFILL_JOBS = 1
/** Vazio: backfill também compete no slot global (evita 1+N no Gemini). */
const CONCURRENCY_EXEMPT_JOB_TYPES = new Set()
const STALE_ACTIVE_JOB_MS = 15 * 60 * 1000
const META_DOC = 'generationConcurrency/global'

function getDb() {
  return admin.firestore()
}

function metaRef() {
  return getDb().doc(META_DOC)
}

async function pruneStaleActiveJobs() {
  const db = getDb()
  const cutoff = Date.now() - STALE_ACTIVE_JOB_MS
  const snap = await db.collection('generationActiveJobs').limit(80).get()
  let pruned = 0
  let runningNonExempt = 0

  for (const doc of snap.docs) {
    const data = doc.data() || {}
    const heartbeat = data.lastHeartbeat?.toDate?.()
    const { userId, jobId } = data

    let shouldDelete = false
    let isRunning = false

    if (userId && jobId) {
      const jobSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
      if (!jobSnap.exists) {
        shouldDelete = true
      } else {
        const status = jobSnap.data().status
        if (['done', 'error', 'cancelled'].includes(status)) {
          shouldDelete = true
        } else if (['waiting_api', 'waiting_retry', 'waiting_timeout'].includes(status)) {
          shouldDelete = true
        } else if (status === 'running') {
          isRunning = true
          if (!heartbeat || heartbeat.getTime() <= cutoff) {
            shouldDelete = true
            isRunning = false
          }
        }
      }
    } else if (!heartbeat || heartbeat.getTime() <= cutoff) {
      shouldDelete = true
    }

    if (shouldDelete) {
      await doc.ref.delete().catch(() => {})
      pruned += 1
      continue
    }

    if (isRunning && !data.exempt) runningNonExempt += 1
  }

  // Reconcilia contador atômico com a realidade
  await metaRef().set(
    {
      runningCount: runningNonExempt,
      reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
      maxConcurrent: MAX_CONCURRENT_SERVER_JOBS,
    },
    { merge: true },
  )

  return { pruned, runningNonExempt }
}

async function countActiveServerJobs() {
  const { runningNonExempt } = await pruneStaleActiveJobs()
  return runningNonExempt
}

async function countRunningBackfillJobs(excludeJobId = null) {
  await pruneStaleActiveJobs()
  const db = getDb()
  const snap = await db.collection('generationActiveJobs').limit(50).get()
  let count = 0

  for (const doc of snap.docs) {
    if (doc.id === excludeJobId) continue
    const data = doc.data()
    if (data.jobType !== 'guia_mentorado_backfill') continue

    const { userId, jobId } = data
    if (!userId || !jobId) continue

    const jobSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
    if (!jobSnap.exists) {
      await doc.ref.delete().catch(() => {})
      continue
    }

    if (jobSnap.data().status === 'running') count += 1
  }

  return count
}

async function tryAcquireServerJobSlot(userId, jobId, jobType = '') {
  if (CONCURRENCY_EXEMPT_JOB_TYPES.has(jobType)) {
    if (jobType === 'guia_mentorado_backfill') {
      const otherBackfills = await countRunningBackfillJobs(jobId)
      if (otherBackfills >= MAX_CONCURRENT_BACKFILL_JOBS) {
        return { acquired: false, reason: 'backfill_limit', active: otherBackfills }
      }
    }

    const ts = admin.firestore.FieldValue.serverTimestamp()
    await getDb()
      .doc(`generationActiveJobs/${jobId}`)
      .set(
        {
          userId,
          jobId,
          jobType,
          status: 'running',
          exempt: true,
          lastHeartbeat: ts,
          acquiredAt: ts,
        },
        { merge: true },
      )
    return { acquired: true, exempt: true }
  }

  const db = getDb()
  const jobRef = db.doc(`users/${userId}/generationJobs/${jobId}`)
  const activeRef = db.doc(`generationActiveJobs/${jobId}`)
  const counterRef = metaRef()

  await pruneStaleActiveJobs()

  return db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(jobRef)
    if (!jobSnap.exists) return { acquired: false, reason: 'missing' }

    const status = jobSnap.data().status
    if (
      status !== 'pending' &&
      status !== 'running' &&
      !['waiting_api', 'waiting_retry', 'waiting_timeout'].includes(status)
    ) {
      return { acquired: false, reason: 'inactive' }
    }

    const activeSnap = await tx.get(activeRef)
    const alreadyActive = activeSnap.exists && !activeSnap.data()?.exempt

    const counterSnap = await tx.get(counterRef)
    const currentCount = Number(counterSnap.exists ? counterSnap.data()?.runningCount : 0) || 0

    if (!alreadyActive && currentCount >= MAX_CONCURRENT_SERVER_JOBS) {
      return { acquired: false, reason: 'limit', active: currentCount }
    }

    const ts = admin.firestore.FieldValue.serverTimestamp()
    tx.set(
      activeRef,
      {
        userId,
        jobId,
        jobType: jobType || jobSnap.data().jobType || null,
        status: 'running',
        exempt: false,
        lastHeartbeat: ts,
        acquiredAt: ts,
      },
      { merge: true },
    )

    if (!alreadyActive) {
      tx.set(
        counterRef,
        {
          runningCount: currentCount + 1,
          maxConcurrent: MAX_CONCURRENT_SERVER_JOBS,
          updatedAt: ts,
        },
        { merge: true },
      )
    }

    return { acquired: true, active: alreadyActive ? currentCount : currentCount + 1 }
  })
}

async function releaseServerJobSlot(jobId) {
  if (!jobId) return
  const db = getDb()
  const activeRef = db.doc(`generationActiveJobs/${jobId}`)
  const counterRef = metaRef()

  await db
    .runTransaction(async (tx) => {
      const activeSnap = await tx.get(activeRef)
      if (!activeSnap.exists) return

      const wasExempt = Boolean(activeSnap.data()?.exempt)
      tx.delete(activeRef)

      if (!wasExempt) {
        const counterSnap = await tx.get(counterRef)
        const current = Number(counterSnap.exists ? counterSnap.data()?.runningCount : 0) || 0
        tx.set(
          counterRef,
          {
            runningCount: Math.max(0, current - 1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }
    })
    .catch(() => {
      // Fallback best-effort
      return activeRef.delete().catch(() => {})
    })
}

module.exports = {
  MAX_CONCURRENT_SERVER_JOBS,
  MAX_CONCURRENT_BACKFILL_JOBS,
  CONCURRENCY_EXEMPT_JOB_TYPES,
  countActiveServerJobs,
  countRunningBackfillJobs,
  tryAcquireServerJobSlot,
  pruneStaleActiveJobs,
  releaseServerJobSlot,
}
