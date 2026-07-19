const admin = require('firebase-admin')
const { verifyAuthRequest, verifyAdminRequest } = require('../emailUtils')
const { kickGenerationJob } = require('../generation/generationJobKick')
const {
  nudgeStalledGenerationJob,
  cancelGenerationJob,
  cancelAllGenerationJobs,
  cancelAllActiveJobsGlobally,
} = require('../generation/generationJobResume')

async function handleKickGenerationJob(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  try {
    const authUser = await verifyAuthRequest(req)
    const { userId, jobId } = req.body || {}
    if (!userId || !jobId) return res.status(400).json({ error: 'userId e jobId são obrigatórios' })
    if (authUser.uid !== userId) {
      try {
        await verifyAdminRequest(req)
      } catch {
        return res.status(403).json({ error: 'Não autorizado' })
      }
    }
    const result = await kickGenerationJob(userId, jobId, { wait: false })
    return res.status(200).json(result)
  } catch (err) {
    console.error('[kickGenerationJob]', err)
    return res.status(500).json({ error: err.message || 'Erro ao iniciar job' })
  }
}

async function handleNudgeGenerationJobResume(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  try {
    const authUser = await verifyAuthRequest(req)
    const { userId, jobId } = req.body || {}
    if (!userId || !jobId) return res.status(400).json({ error: 'userId e jobId são obrigatórios' })
    if (authUser.uid !== userId) {
      try {
        await verifyAdminRequest(req)
      } catch {
        return res.status(403).json({ error: 'Não autorizado' })
      }
    }
    const result = await nudgeStalledGenerationJob(userId, jobId)
    return res.status(200).json(result)
  } catch (err) {
    console.error('[nudgeGenerationJobResume]', err)
    return res.status(500).json({ error: err.message || 'Erro ao retomar job' })
  }
}

async function handleCancelGenerationJob(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  try {
    const authUser = await verifyAuthRequest(req)
    const { userId, jobId, all, global } = req.body || {}

    if (global) {
      await verifyAdminRequest(req)
      const result = await cancelAllActiveJobsGlobally()
      return res.status(200).json(result)
    }

    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' })
    if (authUser.uid !== userId) {
      try {
        await verifyAdminRequest(req)
      } catch {
        return res.status(403).json({ error: 'Não autorizado' })
      }
    }

    if (all) {
      const result = await cancelAllGenerationJobs(userId)
      return res.status(200).json(result)
    }
    if (!jobId) return res.status(400).json({ error: 'jobId é obrigatório (ou all: true)' })

    const result = await cancelGenerationJob(userId, jobId)
    return res.status(200).json(result)
  } catch (err) {
    console.error('[cancelGenerationJob]', err)
    return res.status(500).json({ error: err.message || 'Erro ao cancelar job' })
  }
}

async function handleListActiveGenerationJobs(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }
  try {
    await verifyAdminRequest(req)
    const limit = Math.min(Number(req.body?.limit || req.query?.limit) || 50, 100)
    const db = admin.firestore()
    const ACTIVE = ['pending', 'running', 'waiting_api', 'waiting_retry', 'waiting_timeout']

    const snap = await db
      .collectionGroup('generationJobs')
      .where('runOnServer', '==', true)
      .where('status', 'in', ACTIVE)
      .limit(limit)
      .get()

    const jobs = snap.docs.map((d) => {
      const data = d.data() || {}
      const pathParts = d.ref.path.split('/')
      const ownerUserId = pathParts[0] === 'users' ? pathParts[1] : data.userId || null
      return {
        id: d.id,
        path: d.ref.path,
        userId: ownerUserId,
        courseId: data.courseId || null,
        jobType: data.jobType || null,
        status: data.status || null,
        progress: data.progress ?? null,
        message: data.message || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
      }
    })

    const concurrencySnap = await db.doc('generationConcurrency/global').get()
    const concurrency = concurrencySnap.exists ? concurrencySnap.data() : {}

    return res.status(200).json({ jobs, concurrency })
  } catch (err) {
    console.error('[listActiveGenerationJobs]', err)
    return res.status(err.status || 500).json({ error: err.message || 'Erro ao listar jobs' })
  }
}

module.exports = {
  handleKickGenerationJob,
  handleNudgeGenerationJobResume,
  handleCancelGenerationJob,
  handleListActiveGenerationJobs,
}
