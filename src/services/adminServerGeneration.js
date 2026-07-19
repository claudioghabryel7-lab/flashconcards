import { startBackgroundGeneration } from './aiGenerationRunner'

/** Processa edital na aba do admin (Gemini + Firestore local). */
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

/**
 * Gera matéria revisada na aba do admin.
 */
export async function enqueueAdminMateriaRevisada({
  userId,
  courseId,
  materia,
  prompt,
  docId = null,
  status = 'indisponivel',
}) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!materia?.trim()) throw new Error('Nome da matéria ausente.')
  if (!prompt?.trim()) throw new Error('Prompt da matéria ausente.')

  const safeDocId =
    docId ||
    String(materia)
      .trim()
      .replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '_')
      .substring(0, 100)

  return startBackgroundGeneration({
    userId,
    courseId: courseId || 'alego-default',
    jobType: 'admin_materia_revisada',
    topicKey: safeDocId,
    metadata: { materia: materia.trim(), source: 'admin_panel' },
    runOnServer: true,
    serverPayload: {
      prompt,
      aiOptions: {
        useRAG: true,
        generationConfig: { maxOutputTokens: 16000, temperature: 0.7 },
      },
      savePlan: {
        materia: materia.trim(),
        docId: safeDocId,
        status,
      },
    },
  })
}
