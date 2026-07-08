import {
  createGenerationJob,
  updateGenerationJob,
  GENERATION_JOB_STATUS,
} from './generationJobService'
import { formatAiErrorForUser } from '../utils/geminiApi'

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
 * Inicia geração em segundo plano (retorna jobId imediatamente).
 * A promise continua mesmo se o componente desmontar.
 */
export async function startBackgroundGeneration({
  userId,
  courseId = null,
  jobType,
  topicKey = null,
  metadata = {},
  task,
}) {
  if (!userId || typeof task !== 'function') {
    throw new Error('Usuário não autenticado para geração em segundo plano.')
  }

  const jobId = await createGenerationJob({
    userId,
    courseId,
    jobType,
    topicKey,
    metadata,
  })

  const promise = executeJob(userId, jobId, task)
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
