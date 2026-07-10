import { readEnv } from '@/lib/env.js'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  normalizeFlashcard,
  cardMatchesModule,
  formatTopicoAsModulo,
} from '../utils/editalVerticalizadoLoader'
import { normalizeTopicKeyForStorage } from '../utils/topicKeyFirestore'
import { generateAiJson, hasGeminiApiKeys } from '../utils/geminiApi'
import { startBackgroundGeneration } from './aiGenerationRunner'
import { buildFlashcardsTopicoPayload } from '../utils/serverGenerationPayload'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { fetchTopicoPublishStatus } from './topicoPublishService'
import {
  MIN_TOPIC_FLASHCARDS as MIN_FLASHCARDS,
  MAX_TOPIC_FLASHCARDS as MAX_FLASHCARDS,
  FLASHCARD_BATCH_SIZE as BATCH_SIZE,
} from '../constants/topicFlashcards'

function topicKeyMatches(cardKey, targetKey) {
  if (!targetKey) return false
  const normalizedTarget = normalizeTopicKeyForStorage(targetKey)
  if (!normalizedTarget) return false
  if (!cardKey) return false
  return normalizeTopicKeyForStorage(cardKey) === normalizedTarget
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

/**
 * Busca flashcards já salvos para um tópico (compartilhados entre usuários do curso).
 */
export async function fetchFlashcardsForTopico(
  courseId,
  disciplina,
  modulo,
  topicKey,
  { includeUnpublished = false } = {},
) {
  const resolvedId = courseId || 'alego-default'
  const flashcardsRef = collection(db, 'courses', resolvedId, 'flashcards')
  const normalizedTopicKey = normalizeTopicKeyForStorage(topicKey)

  const filterClient = (docs) =>
    docs
      .map((d) => normalizeFlashcard({ id: d.id, ...d.data() }))
      .filter((card) => {
        if (normalizedTopicKey && topicKeyMatches(card.topicKey, normalizedTopicKey)) return true
        if (disciplina && modulo) return cardMatchesModule(card, disciplina, modulo)
        return false
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  if (includeUnpublished) {
    const snapshot = await getDocs(flashcardsRef)
    return filterClient(snapshot.docs)
  }

  const published = CONTENT_STATUS.AVAILABLE
  let docs = []

  if (normalizedTopicKey) {
    const byTopic = await getDocs(
      query(flashcardsRef, where('status', '==', published), where('topicKey', '==', normalizedTopicKey)),
    )
    docs = byTopic.docs
  }

  if (docs.length === 0 && disciplina && modulo) {
    const byModule = await getDocs(
      query(
        flashcardsRef,
        where('status', '==', published),
        where('materia', '==', disciplina),
        where('modulo', '==', modulo),
      ),
    )
    docs = byModule.docs
  }

  return filterClient(docs)
}

async function deleteExistingFlashcardsForTopico(courseId, topicKey, disciplina, modulo) {
  const existing = await fetchFlashcardsForTopico(courseId, disciplina, modulo, topicKey, {
    includeUnpublished: true,
  })

  if (!existing.length) return

  const batch = writeBatch(db)
  existing.forEach((card) => {
    batch.delete(doc(db, 'courses', courseId || 'alego-default', 'flashcards', card.id))
  })
  await batch.commit()
}

function buildTopicoFlashcardPrompt({
  courseName,
  disciplina,
  topicoNome,
  topicoNumero,
  modulo,
  banca,
  editalText,
  batchNumber,
  totalBatches,
  cardsInBatch,
  existingFronts = [],
}) {
  const existingList = existingFronts.length
    ? `\nNÃO repita estas frentes já geradas:\n${existingFronts.slice(0, 40).map((f) => `- ${f}`).join('\n')}`
    : ''

  return `Gere flashcards para o tópico do edital abaixo.

CURSO: ${courseName}
DISCIPLINA: ${disciplina}
TÓPICO: ${topicoNumero ? `${topicoNumero} - ` : ''}${topicoNome}
MÓDULO: ${modulo}
BANCA: ${banca || 'não informada'}
LOTE: ${batchNumber}/${totalBatches} — gere exatamente ${cardsInBatch} cards neste lote.
${existingList}

EDITAL (trecho):
${(editalText || '').slice(0, 12000)}

FORMATO JSON OBRIGATÓRIO:
{
  "flashcards": [
    { "frente": "pergunta", "verso": "resposta completa", "dificuldade": "fácil|médio|difícil" }
  ]
}

REGRAS:
- Retorne APENAS JSON válido
- Sem markdown nos textos
- Respostas completas e detalhadas (mínimo 2-4 frases no verso), nunca superficiais
- Cubra TODO o tópico do edital — o curso precisa de ${MIN_FLASHCARDS} a ${MAX_FLASHCARDS} cards no total
- Conteúdo fiel à legislação e ao edital`
}

async function generateFlashcardBatch(params) {
  const prompt = buildTopicoFlashcardPrompt(params)
  const parsed = await generateAiJson(prompt, {
    courseId: params.courseId,
    generationConfig: {
      maxOutputTokens: 24000,
      temperature: 0.35,
    },
  })
  return parsed.flashcards || []
}

/**
 * Gera e salva flashcards para um único tópico (40–60 cards, cobrindo todo o tópico).
 */
export async function generateAndSaveFlashcardsForTopico({
  courseId,
  disciplina,
  topicoNome,
  topicoNumero,
  topicKey,
  moduloLabel,
  courseName,
  editalText = '',
  userId = null,
}) {
  if (!hasGeminiApiKeys()) {
    throw new Error('Nenhuma API key Gemini configurada (VITE_GEMINI_API_KEY ou backups)')
  }

  const resolvedId = courseId || 'alego-default'
  const courseDoc = await getDoc(doc(db, 'courses', resolvedId))
  const courseData = courseDoc.exists() ? courseDoc.data() : {}
  const banca = courseData.banca || ''

  const modulo = moduloLabel || formatTopicoAsModulo({ numero: topicoNumero, nome: topicoNome })
  const normalizedTopicKey = normalizeTopicKeyForStorage(topicKey)

  const baseParams = {
    courseId: resolvedId,
    courseName: courseName || courseData.name || courseData.competition || '',
    disciplina,
    topicoNome,
    topicoNumero,
    modulo,
    banca,
    editalText,
  }

  if (userId) {
    const initialStatus = await fetchTopicoPublishStatus(resolvedId, normalizedTopicKey)
    const { promise } = await startBackgroundGeneration({
      userId,
      courseId: resolvedId,
      jobType: 'flashcards_topico',
      topicKey: normalizedTopicKey,
      runOnServer: true,
      serverPayload: buildFlashcardsTopicoPayload({
        courseId: resolvedId,
        status: initialStatus,
        flashcardMeta: {
          ...baseParams,
          topicKey: normalizedTopicKey,
        },
      }),
    })

    await promise
    return fetchFlashcardsForTopico(resolvedId, disciplina, modulo, normalizedTopicKey, {
      includeUnpublished: true,
    })
  }

  try {
    await deleteExistingFlashcardsForTopico(resolvedId, normalizedTopicKey, disciplina, modulo)

    let allItems = []
    const firstBatchCount = Math.min(BATCH_SIZE, MAX_FLASHCARDS)

    const batch1 = await generateFlashcardBatch({
      ...baseParams,
      batchNumber: 1,
      totalBatches: 2,
      cardsInBatch: firstBatchCount,
      existingFronts: [],
    })
    allItems = dedupeFlashcards(batch1)

    if (allItems.length < MIN_FLASHCARDS) {
      const remaining = Math.min(MAX_FLASHCARDS - allItems.length, BATCH_SIZE)
      const batch2 = await generateFlashcardBatch({
        ...baseParams,
        batchNumber: 2,
        totalBatches: 2,
        cardsInBatch: remaining,
        existingFronts: allItems.map((c) => c.frente || c.pergunta),
      })
      allItems = dedupeFlashcards([...allItems, ...batch2])
    }

    if (allItems.length < MIN_FLASHCARDS) {
      const remaining = Math.min(MAX_FLASHCARDS - allItems.length, BATCH_SIZE)
      const batch3 = await generateFlashcardBatch({
        ...baseParams,
        batchNumber: 3,
        totalBatches: 3,
        cardsInBatch: remaining,
        existingFronts: allItems.map((c) => c.frente || c.pergunta),
      })
      allItems = dedupeFlashcards([...allItems, ...batch3])
    }

    allItems = allItems.slice(0, MAX_FLASHCARDS)

    if (allItems.length < MIN_FLASHCARDS) {
      throw new Error(
        `A IA gerou apenas ${allItems.length} flashcards. São necessários no mínimo ${MIN_FLASHCARDS} para cobrir o tópico. Tente novamente.`,
      )
    }

    const batch = writeBatch(db)
    const flashcardsRef = collection(db, 'courses', resolvedId, 'flashcards')
    const saved = []

    const initialStatus = await fetchTopicoPublishStatus(resolvedId, normalizedTopicKey)

    allItems.forEach((item, index) => {
      const docRef = doc(flashcardsRef)
      const frente = item.frente || item.pergunta || ''
      const verso = item.verso || item.resposta || ''
      const payload = {
        disciplina,
        materia: disciplina,
        topico: topicoNome,
        topicoNumero: topicoNumero || '',
        modulo,
        topicKey: normalizedTopicKey,
        frente,
        verso,
        pergunta: frente,
        resposta: verso,
        dificuldade: item.dificuldade || 'médio',
        courseId: resolvedId,
        shared: true,
        status: initialStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: index,
      }
      batch.set(docRef, payload)
      saved.push({ id: docRef.id, ...payload })
    })

    await batch.commit()

    return saved.map((c) => normalizeFlashcard(c))
  } catch (error) {
    throw error
  }
}
