import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  normalizeFlashcard,
  cardMatchesModule,
  formatTopicoAsModulo,
} from '../utils/editalVerticalizadoLoader'
import { normalizeTopicKeyForStorage } from '../utils/topicKeyFirestore'
import { startBackgroundGeneration } from './aiGenerationRunner'
import { buildFlashcardsTopicoPayload } from '../utils/serverGenerationPayload'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { fetchTopicoPublishStatus } from './topicoPublishService'

function topicKeyMatches(cardKey, targetKey) {
  if (!targetKey) return false
  const normalizedTarget = normalizeTopicKeyForStorage(targetKey)
  if (!normalizedTarget) return false
  if (!cardKey) return false
  return normalizeTopicKeyForStorage(cardKey) === normalizedTarget
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

/**
 * Gera e salva flashcards para um único tópico (30 cards estratégicos, pipeline servidor).
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

  if (!userId) {
    throw new Error('Faça login como admin para gerar flashcards.')
  }

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
      forceRegenerate: true,
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
