const admin = require('firebase-admin')

const MAX_CONCURRENT_SERVER_JOBS = 3
const CONCURRENCY_EXEMPT_JOB_TYPES = new Set(['guia_mentorado_backfill'])
const STALE_ACTIVE_JOB_MS = 15 * 60 * 1000

function getDb() {
  return admin.firestore()
}

async function pruneStaleActiveJobs() {
  const db = getDb()
  const cutoff = Date.now() - STALE_ACTIVE_JOB_MS
  const snap = await db.collection('generationActiveJobs').limit(50).get()
  let pruned = 0

  for (const doc of snap.docs) {
    const data = doc.data()
    const heartbeat = data.lastHeartbeat?.toDate?.()
    if (heartbeat && heartbeat.getTime() > cutoff) continue

    const { userId, jobId } = data
    if (userId && jobId) {
      const jobSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
      if (jobSnap.exists) {
        const status = jobSnap.data().status
        if (['done', 'error', 'cancelled'].includes(status)) {
          await doc.ref.delete().catch(() => {})
          pruned += 1
          continue
        }
      }
    }

    if (!heartbeat || heartbeat.getTime() <= cutoff) {
      await doc.ref.delete().catch(() => {})
      pruned += 1
    }
  }

  return pruned
}

async function countActiveServerJobs() {
  await pruneStaleActiveJobs()
  const snap = await getDb().collection('generationActiveJobs').get()
  return snap.size
}

async function tryAcquireServerJobSlot(userId, jobId, jobType = '') {
  if (CONCURRENCY_EXEMPT_JOB_TYPES.has(jobType)) {
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

    const activeSnap = await tx.get(db.collection('generationActiveJobs'))
    const activeDocs = activeSnap.docs.filter((d) => !d.data().exempt)
    const alreadyActive = activeDocs.some((d) => d.id === jobId)
    if (!alreadyActive && activeDocs.length >= MAX_CONCURRENT_SERVER_JOBS) {
      return { acquired: false, reason: 'limit', active: activeDocs.length }
    }

    const ts = admin.firestore.FieldValue.serverTimestamp()
    tx.set(
      activeRef,
      {
        userId,
        jobId,
        jobType: jobType || jobSnap.data().jobType || null,
        status: 'running',
        lastHeartbeat: ts,
        acquiredAt: ts,
      },
      { merge: true },
    )

    return { acquired: true, active: activeDocs.length }
  })
}

module.exports = {
  MAX_CONCURRENT_SERVER_JOBS,
  CONCURRENCY_EXEMPT_JOB_TYPES,
  countActiveServerJobs,
  tryAcquireServerJobSlot,
  pruneStaleActiveJobs,
}
