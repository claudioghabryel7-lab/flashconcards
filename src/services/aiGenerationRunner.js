import {
  createGenerationJob,
  updateGenerationJob,
  findActiveDuplicateGenerationJob,
  buildGenerationJobFingerprint,
  GENERATION_JOB_STATUS,
} from './generationJobService'
import { formatAiErrorForUser } from '../utils/geminiApi'
import { processLocalGenerationJob } from './localJobProcessor'

/** Promessas ativas — sobrevivem a desmontagem de componentes React. */
const activeTasks = new Map()
/** fingerprint → { jobId, promise } */
const activeByFingerprint = new Map()
/** fingerprint → Promise do start em andamento (claim síncrono). */
const startingByFingerprint = new Map()

async function executeJob(userId, jobId, task, fingerprint = null) {
  try {
    const updateProgress = async (progress, message) => {
      await updateGenerationJob(userId, jobId, {
        status: GENERATION_JOB_STATUS.RUNNING,
        progress: Math.min(100, Math.max(0, progress ?? 0)),
        message: message || 'Gerando…',
      })
    }

    await updateProgress(5, 'Iniciando geração…')
    const result = await task({ updateProgress, jobId })

    await updateGenerationJob(userId, jobId, {
      status: GENERATION_JOB_STATUS.DONE,
      progress: 100,
      message: 'Concluído',
    })

    return result
  } catch (error) {
    const userMessage = formatAiErrorForUser(error)
    await updateGenerationJob(userId, jobId, {
      status: GENERATION_JOB_STATUS.ERROR,
      progress: 100,
      message: userMessage,
      errorCode: error?.code || null,
    }).catch(() => {})
    const wrapped = new Error(userMessage)
    wrapped.cause = error
    wrapped.isAiGenerationError = true
    throw wrapped
  } finally {
    activeTasks.delete(jobId)
    if (fingerprint && activeByFingerprint.get(fingerprint)?.jobId === jobId) {
      activeByFingerprint.delete(fingerprint)
    }
  }
}

function claimFingerprintStart(fingerprint) {
  const existing = startingByFingerprint.get(fingerprint)
  if (existing) return { owner: false, gate: existing }

  let resolveGate = () => {}
  const gate = new Promise((resolve) => {
    resolveGate = resolve
  })
  gate._resolve = resolveGate
  startingByFingerprint.set(fingerprint, gate)
  return { owner: true, gate }
}

/**
 * Gera em segundo plano na aba do admin.
 * Deduplica: mesma assinatura (curso + tipo + tópico + data) → reusa ou bloqueia.
 */
export async function startBackgroundGeneration({
  userId,
  courseId = null,
  jobType,
  topicKey = null,
  metadata = {},
  task,
  serverPayload = null,
  runOnServer: _runOnServer = false,
}) {
  if (!userId) {
    throw new Error('Usuário não autenticado para geração em segundo plano.')
  }

  const hasTask = typeof task === 'function'
  const hasPayload = Boolean(serverPayload)
  if (!hasTask && !hasPayload) {
    throw new Error('Task ou serverPayload é obrigatório.')
  }

  const fingerprint = buildGenerationJobFingerprint({
    courseId,
    jobType,
    topicKey,
    metadata,
  })

  const local = activeByFingerprint.get(fingerprint)
  if (local?.promise) {
    console.info('[generation] reusando job local duplicado:', local.jobId)
    return { jobId: local.jobId, promise: local.promise, duplicate: true }
  }

  const claim = claimFingerprintStart(fingerprint)
  if (!claim.owner) {
    const started = await claim.gate
    if (started?.promise) {
      return { ...started, duplicate: true }
    }
    const again = activeByFingerprint.get(fingerprint)
    if (again?.promise) {
      return { jobId: again.jobId, promise: again.promise, duplicate: true }
    }
    const err = new Error(
      'Já existe um job ativo gerando o mesmo conteúdo. Aguarde terminar.',
    )
    err.code = 'duplicate_generation_job'
    throw err
  }

  try {
    const remote = await findActiveDuplicateGenerationJob({
      userId,
      courseId,
      jobType,
      topicKey,
      metadata,
    })
    if (remote?.id) {
      const err = new Error(
        `Já existe um job ativo gerando o mesmo conteúdo (${String(remote.id).slice(0, 8)}…). Aguarde terminar.`,
      )
      err.code = 'duplicate_generation_job'
      err.existingJobId = remote.id
      throw err
    }

    const jobId = await createGenerationJob({
      userId,
      courseId,
      jobType,
      topicKey,
      metadata,
      serverPayload: null,
      runOnServer: false,
    })

    const localTask =
      hasTask
        ? task
        : async ({ updateProgress, jobId: activeJobId }) =>
            processLocalGenerationJob({
              jobType,
              courseId,
              serverPayload,
              updateProgress,
              userId,
              jobId: activeJobId || jobId,
            })

    const promise = executeJob(userId, jobId, localTask, fingerprint)
    promise.catch((err) => {
      console.error('[generation] task falhou:', err?.message || err)
    })
    activeTasks.set(jobId, promise)
    activeByFingerprint.set(fingerprint, { jobId, promise })

    const result = { jobId, promise, duplicate: false }
    claim.gate._resolve(result)
    return result
  } catch (error) {
    claim.gate._resolve(null)
    if (error?.code === 'duplicate_generation_job') {
      const existing = activeByFingerprint.get(fingerprint)
      if (existing?.promise) {
        return { jobId: existing.jobId, promise: existing.promise, duplicate: true }
      }
    }
    throw error
  } finally {
    startingByFingerprint.delete(fingerprint)
  }
}

/** Compat: executa sem job se não houver usuário. */
export function runBackgroundGeneration(params) {
  if (!params?.userId) {
    return {
      jobId: null,
      promise: params?.task?.({ updateProgress: async () => {}, jobId: null }) ?? Promise.resolve(),
    }
  }
  return startBackgroundGeneration(params)
}

export function getActiveGenerationCount() {
  return activeTasks.size
}

export function isGenerationRunning(jobId) {
  return activeTasks.has(jobId)
}

export function getActiveJobByFingerprint(fingerprint) {
  return activeByFingerprint.get(fingerprint) || null
}
