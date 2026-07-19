import {
  createGenerationJob,
  updateGenerationJob,
  GENERATION_JOB_STATUS,
} from './generationJobService'
import { formatAiErrorForUser } from '../utils/geminiApi'
import { processLocalGenerationJob } from './localJobProcessor'

/** Promessas ativas — sobrevivem a desmontagem de componentes React. */
const activeTasks = new Map()

async function executeJob(userId, jobId, task) {
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
  }
}

/**
 * Gera em segundo plano na aba do admin (sem Cloud Functions).
 * Mantém a aba aberta até concluir.
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
      : async ({ updateProgress }) =>
          processLocalGenerationJob({
            jobType,
            courseId,
            serverPayload,
            updateProgress,
          })

  const promise = executeJob(userId, jobId, localTask)
  promise.catch((err) => {
    console.error('[generation] task falhou:', err?.message || err)
  })
  activeTasks.set(jobId, promise)
  return { jobId, promise }
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
