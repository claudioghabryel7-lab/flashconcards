const { generateAiJson } = require('./geminiServer')
const {
  sanitizeTopicKeyForFirestore,
  normalizeTopicKeyForStorage,
} = require('./topicKeyUtils')

const CONTENT_STATUS = {
  AVAILABLE: 'disponivel',
  UNAVAILABLE: 'indisponivel',
}

const MIN_FLASHCARDS = 40
const MAX_FLASHCARDS = 60
const BATCH_SIZE = 30

function getDb() {
  const admin = require('firebase-admin')
  return admin.firestore()
}

function normalizeCardText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeFlashcards(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const front = normalizeCardText(item.frente || item.pergunta)
    if (!front || seen.has(front)) return false
    seen.add(front)
    return true
  })
}

function buildFlashcardPrompt(meta, batchNumber, totalBatches, cardsInBatch, existingFronts = []) {
  const existingList = existingFronts.length
    ? `\nNÃO repita:\n${existingFronts.slice(0, 40).map((f) => `- ${f}`).join('\n')}`
    : ''

  return `Gere flashcards para o tópico:
CURSO: ${meta.courseName || ''}
DISCIPLINA: ${meta.disciplina}
TÓPICO: ${meta.topicoNumero ? `${meta.topicoNumero} - ` : ''}${meta.topicoNome}
LOTE: ${batchNumber}/${totalBatches} — ${cardsInBatch} cards
${existingList}

EDITAL:
${(meta.editalText || '').slice(0, 12000)}

JSON: { "flashcards": [{ "frente": "", "verso": "", "dificuldade": "médio" }] }
Retorne APENAS JSON válido.`
}

async function docExists(path) {
  const snap = await getDb().doc(path).get()
  return snap.exists()
}

async function hasFlashcards(courseId, topicKey, disciplina, modulo) {
  const snap = await getDb().collection(`courses/${courseId}/flashcards`).get()
  const normalized = normalizeTopicKeyForStorage(topicKey)
  return snap.docs.some((d) => {
    const data = d.data()
    if (normalizeTopicKeyForStorage(data.topicKey) === normalized) return true
    return data.materia === disciplina && data.modulo === modulo
  })
}

async function hasConteudo(courseId, topicKey) {
  const key = sanitizeTopicKeyForFirestore(topicKey)
  const snap = await getDb().doc(`courses/${courseId}/conteudosCompletos/${key}`).get()
  if (!snap.exists()) return false
  const data = snap.data()
  return Boolean(data.content || (data.secoes && data.secoes.length) || data.revisaoTurbo?.length)
}

async function hasQuestoes(courseId, topicKey) {
  const key = `${sanitizeTopicKeyForFirestore(topicKey)}_nivel_1`
  return docExists(`courses/${courseId}/questoesTopico/${key}`)
}

async function deleteExistingFlashcards(courseId, topicKey, disciplina, modulo) {
  const snap = await getDb().collection(`courses/${courseId}/flashcards`).get()
  const normalized = normalizeTopicKeyForStorage(topicKey)
  const batch = getDb().batch()
  let count = 0

  snap.docs.forEach((d) => {
    const data = d.data()
    const match =
      normalizeTopicKeyForStorage(data.topicKey) === normalized ||
      (data.materia === disciplina && data.modulo === modulo)
    if (match) {
      batch.delete(d.ref)
      count += 1
    }
  })

  if (count) await batch.commit()
}

async function generateAndSaveFlashcards(courseId, topic, status) {
  const meta = topic.flashcardMeta
  if (await hasFlashcards(courseId, topic.topicKey, topic.disciplina, topic.modulo)) {
    return { skipped: true, type: 'flashcards' }
  }

  await deleteExistingFlashcards(courseId, topic.topicKey, topic.disciplina, topic.modulo)

  let allItems = []
  const firstBatchCount = Math.min(BATCH_SIZE, MAX_FLASHCARDS)

  const batch1 = await generateAiJson(
    buildFlashcardPrompt(meta, 1, 2, firstBatchCount, []),
    { generationConfig: { maxOutputTokens: 24000, temperature: 0.35 } },
  )
  allItems = dedupeFlashcards(batch1.flashcards || [])

  if (allItems.length < MIN_FLASHCARDS) {
    const remaining = Math.min(MAX_FLASHCARDS - allItems.length, BATCH_SIZE)
    const batch2 = await generateAiJson(
      buildFlashcardPrompt(
        meta,
        2,
        2,
        remaining,
        allItems.map((c) => c.frente || c.pergunta),
      ),
      { generationConfig: { maxOutputTokens: 24000, temperature: 0.35 } },
    )
    allItems = dedupeFlashcards([...allItems, ...(batch2.flashcards || [])])
  }

  allItems = allItems.slice(0, MAX_FLASHCARDS)
  if (allItems.length < MIN_FLASHCARDS) {
    throw new Error(`Flashcards insuficientes para ${topic.topicoNome} (${allItems.length})`)
  }

  const db = getDb()
  const flashcardsRef = db.collection(`courses/${courseId}/flashcards`)
  let batch = db.batch()
  let opCount = 0
  const ts = require('firebase-admin').firestore.FieldValue.serverTimestamp()

  for (let index = 0; index < allItems.length; index += 1) {
    const item = allItems[index]
    const docRef = flashcardsRef.doc()
    const frente = item.frente || item.pergunta || ''
    const verso = item.verso || item.resposta || ''

    batch.set(docRef, {
      disciplina: meta.disciplina,
      materia: meta.disciplina,
      topico: meta.topicoNome,
      topicoNumero: meta.topicoNumero || '',
      modulo: meta.modulo,
      topicKey: normalizeTopicKeyForStorage(meta.topicKey),
      frente,
      verso,
      pergunta: frente,
      resposta: verso,
      dificuldade: item.dificuldade || 'médio',
      courseId,
      shared: true,
      status,
      createdAt: ts,
      updatedAt: ts,
      order: index,
    })

    opCount += 1
    if (opCount >= 400) {
      await batch.commit()
      batch = db.batch()
      opCount = 0
    }
  }

  if (opCount) await batch.commit()
  return { skipped: false, type: 'flashcards', count: allItems.length }
}

async function generateAndSaveConteudo(courseId, topic, status) {
  if (await hasConteudo(courseId, topic.topicKey)) {
    return { skipped: true, type: 'conteudo' }
  }

  const parsed = await generateAiJson(topic.conteudoPrompt, {
    useRAG: true,
    useGoogleSearch: true,
    generationConfig: { maxOutputTokens: 32000, temperature: 0.35 },
  })

  const sanitizedKey = sanitizeTopicKeyForFirestore(topic.topicKey)
  const ts = require('firebase-admin').firestore.FieldValue.serverTimestamp()

  await getDb()
    .doc(`courses/${courseId}/conteudosCompletos/${sanitizedKey}`)
    .set(
      {
        ...parsed,
        materia: parsed.materia || parsed.titulo || topic.topicoNome,
        numero: parsed.numero || topic.topicKey,
        topicKey: topic.topicKey,
        status,
        updatedAt: ts,
        generatedAt: ts,
      },
      { merge: true },
    )

  return { skipped: false, type: 'conteudo' }
}

async function generateAndSaveQuestoes(courseId, topic, status) {
  if (await hasQuestoes(courseId, topic.topicKey)) {
    return { skipped: true, type: 'questoes' }
  }

  const parsed = await generateAiJson(topic.questoesPrompt, {
    useRAG: true,
    useGoogleSearch: true,
    generationConfig: { maxOutputTokens: 32000, temperature: 0.35 },
  })

  const sanitizedKey = `${sanitizeTopicKeyForFirestore(topic.topicKey)}_nivel_1`
  const ts = require('firebase-admin').firestore.FieldValue.serverTimestamp()

  await getDb()
    .doc(`courses/${courseId}/questoesTopico/${sanitizedKey}`)
    .set(
      {
        ...parsed,
        topico: parsed.topico || topic.topicoNome,
        nivel: 1,
        topicKey: topic.topicKey,
        status,
        updatedAt: ts,
        generatedAt: ts,
      },
      { merge: true },
    )

  return { skipped: false, type: 'questoes' }
}

async function publishTopicoStatus(courseId, topic, status) {
  const normalized = normalizeTopicKeyForStorage(topic.topicKey)
  const sanitized = sanitizeTopicKeyForFirestore(topic.topicKey)
  const ts = require('firebase-admin').firestore.FieldValue.serverTimestamp()
  const db = getDb()

  await db.doc(`courses/${courseId}/topicoStatus/${sanitized}`).set(
    {
      topicKey: normalized,
      status,
      disciplinaNome: topic.disciplina,
      updatedAt: ts,
      mentoradoAutomation: true,
    },
    { merge: true },
  )

  const flashcardsSnap = await db.collection(`courses/${courseId}/flashcards`).get()
  let batch = db.batch()
  let ops = 0

  const queue = async (ref, data) => {
    batch.set(ref, data, { merge: true })
    ops += 1
    if (ops >= 400) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }

  for (const d of flashcardsSnap.docs) {
    const data = d.data()
    if (
      normalizeTopicKeyForStorage(data.topicKey) === normalized ||
      (data.materia === topic.disciplina && data.modulo === topic.modulo)
    ) {
      await queue(d.ref, { status, topicKey: normalized, updatedAt: ts })
    }
  }

  const conteudoRef = db.doc(`courses/${courseId}/conteudosCompletos/${sanitized}`)
  if ((await conteudoRef.get()).exists) {
    await queue(conteudoRef, { status, topicKey: topic.topicKey, updatedAt: ts })
  }

  const questoesRef = db.doc(`courses/${courseId}/questoesTopico/${sanitized}_nivel_1`)
  if ((await questoesRef.get()).exists) {
    await queue(questoesRef, { status, topicKey: normalized, updatedAt: ts })
  }

  if (ops) await batch.commit()
}

async function processGuiaMentoradoAutomation(userId, jobId, courseId, serverPayload, updateJob) {
  const topics = serverPayload?.topics || []
  const autoPublish = serverPayload?.autoPublish !== false

  if (!topics.length) {
    throw new Error('Nenhum tópico enviado para automação do Guia Mentorado.')
  }

  const publishStatus = autoPublish ? CONTENT_STATUS.AVAILABLE : CONTENT_STATUS.UNAVAILABLE
  const total = topics.length
  const errors = []

  const targetDate = serverPayload?.targetDate || null
  const dateLabel = targetDate ? ` (${targetDate})` : ''

  await updateJob(userId, jobId, {
    progress: 2,
    message: `Automação do dia${dateLabel} — ${total} tópico(s)`,
  })

  for (let i = 0; i < topics.length; i += 1) {
    const topic = topics[i]
    const label = topic.topicoNome || topic.topicKey
    const basePct = Math.round((i / total) * 100)

    await updateJob(userId, jobId, {
      progress: Math.min(basePct + 2, 99),
      message: `[${i + 1}/${total}] ${label} — flashcards…`,
    })

    try {
      await generateAndSaveFlashcards(courseId, topic, publishStatus)
    } catch (err) {
      errors.push({ topic: label, step: 'flashcards', error: err.message })
    }

    await updateJob(userId, jobId, {
      progress: Math.min(basePct + 12, 99),
      message: `[${i + 1}/${total}] ${label} — material…`,
    })

    try {
      await generateAndSaveConteudo(courseId, topic, publishStatus)
    } catch (err) {
      errors.push({ topic: label, step: 'conteudo', error: err.message })
    }

    await updateJob(userId, jobId, {
      progress: Math.min(basePct + 22, 99),
      message: `[${i + 1}/${total}] ${label} — questões…`,
    })

    try {
      await generateAndSaveQuestoes(courseId, topic, publishStatus)
    } catch (err) {
      errors.push({ topic: label, step: 'questoes', error: err.message })
    }

    if (autoPublish) {
      try {
        await publishTopicoStatus(courseId, topic, publishStatus)
      } catch (err) {
        errors.push({ topic: label, step: 'publicar', error: err.message })
      }
    }
  }

  if (errors.length >= total * 3) {
    throw new Error('Falha crítica na automação do Guia Mentorado.')
  }

  return { totalTopics: total, errors, autoPublish }
}

module.exports = {
  processGuiaMentoradoAutomation,
}
