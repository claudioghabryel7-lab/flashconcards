/**
 * Substitui Firestore triggers — chamado pelo webhook do Supabase (firestore_docs).
 */
const admin = require('firebase-admin')

function parsePath(path = '') {
  const parts = String(path).split('/').filter(Boolean)
  return parts
}

function buildMockSnap(record, { exists = true } = {}) {
  const data = record?.data || {}
  const path = record?.path || ''
  const ref = admin.firestore().doc(path)
  return {
    exists: exists && Boolean(path),
    id: record?.doc_id || path.split('/').pop(),
    ref,
    data: () => data,
  }
}

function buildMockChange(before, after) {
  return {
    before: buildMockSnap(before, { exists: Boolean(before?.path) }),
    after: buildMockSnap(after, { exists: Boolean(after?.path) }),
  }
}

async function handleGenerationJobCreated(record) {
  const parts = parsePath(record.path)
  if (parts[0] !== 'users' || parts[2] !== 'generationJobs') return { skipped: true }
  const userId = parts[1]
  const jobId = parts[3]
  const data = record.data || {}
  if (!data.runOnServer || data.status !== 'pending') return { skipped: true }

  const { getKickModule } = require('../../functions/generationLoader')
  const { kickServerJobAfterCreate } = getKickModule()
  const result = await kickServerJobAfterCreate(userId, jobId)
  return { ok: true, result }
}

async function handleGenerationJobUpdated(oldRecord, record) {
  const parts = parsePath(record.path)
  if (parts[0] !== 'users' || parts[2] !== 'generationJobs') return { skipped: true }
  const before = oldRecord?.data || {}
  const after = record.data || {}
  if (before.status === after.status || after.status !== 'cancelled') return { skipped: true }

  const { getResumeModule } = require('../../functions/generationLoader')
  const { handleGenerationJobCancelled } = getResumeModule()
  await handleGenerationJobCancelled(parts[1], parts[3], after)
  return { ok: true }
}

async function handlePaymentBrickRequestCreated(record) {
  const parts = parsePath(record.path)
  if (parts[0] !== 'paymentBrickRequests') return { skipped: true }

  const snap = buildMockSnap(record)
  const data = record.data || {}
  if (data.state === 'done' || data.state === 'error') return { skipped: true }

  const index = require('../../functions/index.js')
  // Reutiliza lógica inline via mock — delegamos ao handler exportado se existir .run
  const fn = index.onPaymentBrickRequestCreated
  if (typeof fn === 'function') {
    await fn(snap, { params: { requestId: parts[1] } })
    return { ok: true }
  }
  return { skipped: true, reason: 'no_handler' }
}

async function handleGenerationResumeQueueWrite(oldRecord, record) {
  const parts = parsePath(record?.path)
  if (parts[0] !== 'generationResumeQueue') return { skipped: true }
  if (!record?.path) return { skipped: true }

  const change = buildMockChange(oldRecord, record)
  const fn = require('../../functions/index.js').onGenerationResumeQueueWrite
  if (typeof fn === 'function') {
    await fn(change, { params: { jobId: parts[1] } })
    return { ok: true }
  }
  return { skipped: true }
}

async function handleProfessorFiscalizadorConfigUpdated(oldRecord, record) {
  if (record.path !== 'config/professorFiscalizador') return { skipped: true }
  const change = buildMockChange(oldRecord, record)
  const fn = require('../../functions/index.js').onProfessorFiscalizadorConfigUpdated
  if (typeof fn === 'function') {
    await fn(change, { params: {} })
    return { ok: true }
  }
  return { skipped: true }
}

async function processWebhookPayload(payload) {
  require('./init.cjs')
  const { type, record, old_record: oldRecord } = payload || {}
  if (!record?.path) return { ok: false, error: 'missing_record' }

  if (type === 'INSERT') {
    if (record.path.includes('/generationJobs/')) {
      return handleGenerationJobCreated(record)
    }
    if (record.path.startsWith('paymentBrickRequests/')) {
      return handlePaymentBrickRequestCreated(record)
    }
  }

  if (type === 'UPDATE') {
    if (record.path.includes('/generationJobs/')) {
      return handleGenerationJobUpdated(oldRecord, record)
    }
    if (record.path === 'config/professorFiscalizador') {
      return handleProfessorFiscalizadorConfigUpdated(oldRecord, record)
    }
  }

  if (type === 'INSERT' || type === 'UPDATE') {
    if (record.path.startsWith('generationResumeQueue/')) {
      return handleGenerationResumeQueueWrite(oldRecord, record)
    }
  }

  return { ok: true, skipped: true, path: record.path }
}

module.exports = { processWebhookPayload }
