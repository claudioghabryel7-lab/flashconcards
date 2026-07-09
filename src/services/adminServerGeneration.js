import { startBackgroundGeneration } from './aiGenerationRunner'

/** Enfileira processamento completo do edital no servidor (Cloud Functions). */
export async function enqueueAdminEditalProcessing({ userId, courseId, editalText }) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!editalText?.trim()) throw new Error('Texto do edital vazio.')

  return startBackgroundGeneration({
    userId,
    courseId: courseId || 'alego-default',
    jobType: 'admin_edital_verticalizado',
    metadata: { source: 'admin_panel' },
    runOnServer: true,
    serverPayload: {
      editalText,
      courseId: courseId || 'alego-default',
    },
  })
}
