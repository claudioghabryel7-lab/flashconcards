const admin = require('firebase-admin')

function getDb() {
  return admin.firestore()
}

function statusRef(courseId, targetDate) {
  return getDb().doc(`courses/${courseId}/mentoradoAutomation/${targetDate}`)
}

async function resetGeneratingTopicsOnCancel(courseId, targetDate, reason = 'Cancelado pelo admin') {
  const ref = statusRef(courseId, targetDate)
  const snap = await ref.get()
  if (!snap.exists) return

  const data = snap.data()
  const topics = (data.topics || []).map((t) =>
    t.status === 'generating'
      ? { ...t, status: 'pending', step: 'aguardando', error: null }
      : t,
  )

  await ref.set(
    {
      topics,
      status: 'cancelled',
      reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

async function initDayStatus(courseId, targetDate, topics = [], jobId = null, automationUserId = null) {
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const payload = {
    date: targetDate,
    courseId,
    status: 'running',
    totalTopics: topics.length,
    publishedCount: 0,
    jobId: jobId || null,
    automationUserId: automationUserId || null,
    topics: topics.map((t) => ({
      topicKey: t.topicKey,
      topicoNome: t.topicoNome || t.topicKey,
      disciplina: t.disciplina || '',
      status: 'pending',
      step: 'aguardando',
      flashcards: 'pending',
      material: 'pending',
      questoes: 'pending',
      error: null,
    })),
    updatedAt: ts,
    startedAt: ts,
  }
  await statusRef(courseId, targetDate).set(payload, { merge: true })
  return payload
}

async function updateDayStatus(courseId, targetDate, patch) {
  await statusRef(courseId, targetDate).set(
    {
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

async function updateTopicStep(courseId, targetDate, topicKey, patch) {
  const ref = statusRef(courseId, targetDate)
  const snap = await ref.get()
  if (!snap.exists) return

  const data = snap.data()
  const topics = (data.topics || []).map((t) =>
    t.topicKey === topicKey ? { ...t, ...patch } : t,
  )
  const publishedCount = topics.filter((t) => t.status === 'published').length

  await ref.set(
    {
      topics,
      publishedCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

async function finalizeDayStatus(courseId, targetDate, { errors = [], total = 0 } = {}) {
  const ref = statusRef(courseId, targetDate)
  const snap = await ref.get()
  const topics = snap.exists ? snap.data().topics || [] : []
  const publishedCount = topics.filter((t) => t.status === 'published').length

  let status = 'done'
  if (publishedCount === 0 && errors.length) status = 'error'
  else if (publishedCount < total) status = 'partial'

  await ref.set(
    {
      status,
      publishedCount,
      errors: errors.slice(0, 20),
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

function monthKeyFromDateKey(dateKey) {
  return String(dateKey).slice(0, 7)
}

async function markDayContentGenerated(courseId, targetDate, publishedCount = 0, totalTopics = 0) {
  const monthKey = monthKeyFromDateKey(targetDate)
  await getDb()
    .doc(`courses/${courseId}/cronograma/${monthKey}`)
    .set(
      {
        [`days.${targetDate}.contentGenerated`]: publishedCount >= totalTopics && totalTopics > 0,
        [`days.${targetDate}.contentGeneratedAt`]: admin.firestore.FieldValue.serverTimestamp(),
        [`days.${targetDate}.publishedTopics`]: publishedCount,
        [`days.${targetDate}.totalTopics`]: totalTopics,
      },
      { merge: true },
    )
}

module.exports = {
  initDayStatus,
  updateDayStatus,
  updateTopicStep,
  finalizeDayStatus,
  markDayContentGenerated,
  resetGeneratingTopicsOnCancel,
}
