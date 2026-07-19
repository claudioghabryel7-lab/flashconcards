/** Monta payload para geração local na aba do admin. */

export function buildAiOptions(courseId, overrides = {}) {
  return {
    courseId: courseId || null,
    isLegalContent: true,
    useRAG: true,
    useGoogleSearch: true,
    ...overrides,
  }
}

export function buildConteudoCompletoPayload({ prompt, courseId, topicKey, status, forceRegenerate = false }) {
  return {
    prompt,
    aiOptions: buildAiOptions(courseId, {
      generationConfig: { maxOutputTokens: 32000, temperature: 0.35 },
    }),
    savePlan: {
      topicKey,
      status: status || null,
      forceRegenerate: Boolean(forceRegenerate),
    },
  }
}

export function buildQuestoesTopicoPayload({ prompt, courseId, topicKey, topicoNome, nivel, status, forceRegenerate = false }) {
  return {
    prompt,
    aiOptions: buildAiOptions(courseId),
    savePlan: {
      topicKey,
      topicoNome,
      nivel,
      status: status || null,
      forceRegenerate: Boolean(forceRegenerate),
    },
  }
}

export function buildConteudoIncidenciaPayload({ prompt, courseId, disciplinaNome, disciplinaIdx, status }) {
  return {
    prompt,
    aiOptions: buildAiOptions(courseId),
    savePlan: {
      disciplinaNome,
      disciplinaIdx,
      status: status || null,
    },
  }
}

export function buildQuestoesIncidenciaPayload({
  prompt,
  courseId,
  disciplinaNome,
  disciplinaIdx,
  nivel,
  status,
}) {
  return {
    prompt,
    aiOptions: buildAiOptions(courseId),
    savePlan: {
      disciplinaNome,
      disciplinaIdx,
      nivel,
      status: status || null,
    },
  }
}

export function buildFlashcardsTopicoPayload({ courseId, flashcardMeta, status, forceRegenerate = false }) {
  return {
    aiOptions: buildAiOptions(courseId, { generationConfig: { maxOutputTokens: 24000, temperature: 0.35 } }),
    savePlan: {
      flashcardMeta,
      status: status || null,
      forceRegenerate: Boolean(forceRegenerate),
    },
  }
}
