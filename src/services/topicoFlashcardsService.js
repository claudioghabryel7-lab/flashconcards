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
import { callGeminiWithRetry, extractJsonFromResponse } from '../utils/geminiApi'
import { CONTENT_STATUS } from '../utils/contentStatus'

const MIN_FLASHCARDS = 20
const MAX_FLASHCARDS = 50
const BATCH_SIZE = 25

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
  { includeUnpublished = false } = {}
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
      query(flashcardsRef, where('status', '==', published), where('topicKey', '==', normalizedTopicKey))
    )
    docs = byTopic.docs
  }

  if (docs.length === 0 && disciplina && modulo) {
    const byModule = await getDocs(
      query(
        flashcardsRef,
        where('status', '==', published),
        where('materia', '==', disciplina),
        where('modulo', '==', modulo)
      )
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
  const topicoLabel = `${topicoNumero ? `${topicoNumero} - ` : ''}${topicoNome}`
  const existingList = existingFronts.slice(0, 40).map((f, i) => `${i + 1}. ${f}`).join('\n')

  return `Você é especialista em flashcards para concursos públicos.

═══════════════════════════════════════════════════════════════
ESCOPO OBRIGATÓRIO — APENAS ESTE TÓPICO
═══════════════════════════════════════════════════════════════
CURSO: ${courseName || 'Concurso público'}
DISCIPLINA: ${disciplina}
TÓPICO (ÚNICO PERMITIDO): ${topicoLabel}
MÓDULO: ${modulo}

🚨 REGRA CRÍTICA DE ESCOPO:
- Gere flashcards SOMENTE sobre "${topicoLabel}"
- É PROIBIDO incluir conteúdo de outros tópicos da disciplina "${disciplina}"
- Cada flashcard deve cobrir um conceito, regra, exceção ou pegadinha DENTRO deste tópico
- Abranje TODO o conteúdo programático deste tópico: definições, classificações, regras, exceções, exemplos e pegadinhas de banca

BANCA: ${banca || 'conforme o curso'}
DATA: ${new Date().toLocaleDateString('pt-BR')}

${editalText ? `CONTEXTO DO EDITAL (use apenas o que for deste tópico):\n${editalText.substring(0, 10000)}\n\n` : ''}

LOTE ${batchNumber}/${totalBatches} — gere EXATAMENTE ${cardsInBatch} flashcards novos.

${existingFronts.length > 0 ? `NÃO REPITA estas perguntas já criadas:\n${existingList}\n\n` : ''}

DISTRIBUIÇÃO SUGERIDA DO LOTE:
- Conceitos fundamentais e definições
- Regras, classificações e distinções importantes
- Exceções, detalhes e pegadinhas de banca
- Aplicação prática no estilo da banca ${banca || 'do concurso'}

FORMATO (apenas JSON válido):
{
  "flashcards": [
    {
      "frente": "pergunta objetiva",
      "verso": "resposta completa e fiel",
      "dificuldade": "médio"
    }
  ]
}

REGRAS:
- Retorne APENAS JSON válido
- Sem markdown nos textos
- Respostas completas, nunca superficiais
- Conteúdo fiel à legislação e ao edital`
}

async function generateFlashcardBatch(params) {
  const prompt = buildTopicoFlashcardPrompt(params)
  const response = await callGeminiWithRetry(prompt, {
    courseId: params.courseId,
    generationConfig: {
      maxOutputTokens: 16000,
      temperature: 0.35,
    },
  })

  const parsed = await extractJsonFromResponse(response)
  return parsed.flashcards || []
}

/**
 * Gera e salva flashcards para um único tópico (20–50 cards, cobrindo todo o tópico).
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
}) {
  if (!readEnv('VITE_GEMINI_API_KEY')) {
    throw new Error('VITE_GEMINI_API_KEY não configurada')
  }

  const resolvedId = courseId || 'alego-default'
  const courseDoc = await getDoc(doc(db, 'courses', resolvedId))
  const courseData = courseDoc.exists() ? courseDoc.data() : {}
  const banca = courseData.banca || ''

  const modulo = moduloLabel || formatTopicoAsModulo({ numero: topicoNumero, nome: topicoNome })
  const normalizedTopicKey = normalizeTopicKeyForStorage(topicKey)

  await deleteExistingFlashcardsForTopico(resolvedId, normalizedTopicKey, disciplina, modulo)

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
      existingFronts: allItems.map((item) => item.frente || item.pergunta || ''),
    })
    allItems = dedupeFlashcards([...allItems, ...batch2])
  }

  if (allItems.length < MIN_FLASHCARDS) {
    const remaining = Math.min(MAX_FLASHCARDS - allItems.length, MIN_FLASHCARDS - allItems.length)
    const batch3 = await generateFlashcardBatch({
      ...baseParams,
      batchNumber: 3,
      totalBatches: 3,
      cardsInBatch: Math.max(remaining, 10),
      existingFronts: allItems.map((item) => item.frente || item.pergunta || ''),
    })
    allItems = dedupeFlashcards([...allItems, ...batch3])
  }

  allItems = allItems.slice(0, MAX_FLASHCARDS)

  if (allItems.length < MIN_FLASHCARDS) {
    throw new Error(
      `A IA gerou apenas ${allItems.length} flashcards. São necessários no mínimo ${MIN_FLASHCARDS} para cobrir o tópico. Tente novamente.`
    )
  }

  const batch = writeBatch(db)
  const flashcardsRef = collection(db, 'courses', resolvedId, 'flashcards')
  const saved = []

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
      status: CONTENT_STATUS.UNAVAILABLE,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      order: index,
    }
    batch.set(docRef, payload)
    saved.push({ id: docRef.id, ...payload })
  })

  await batch.commit()
  return saved.map((c) => normalizeFlashcard(c))
}
