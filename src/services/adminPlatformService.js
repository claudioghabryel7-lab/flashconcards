import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { startBackgroundGeneration } from './aiGenerationRunner'

dayjs.extend(utc)
dayjs.extend(timezone)

const PLATFORM_DOC = ['siteSettings', 'platform']
const DEFAULT_MAINTENANCE_MESSAGE =
  'O site está temporariamente em manutenção. Aguarde alguns minutos.'

const TOPIC_SUBCOLLECTIONS = ['flashcards', 'conteudosCompletos', 'questoesTopico', 'topicoStatus']

async function deleteDocsInBatches(docs, batchSize = 50) {
  let deleted = 0
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    await Promise.all(batch.map((item) => deleteDoc(item.ref)))
    deleted += batch.length
  }
  return deleted
}

export async function readPlatformSettings() {
  const snap = await getDoc(doc(db, ...PLATFORM_DOC))
  return snap.exists() ? snap.data() : {}
}

export async function setMaintenanceMode(enabled, message = DEFAULT_MAINTENANCE_MESSAGE) {
  await setDoc(
    doc(db, ...PLATFORM_DOC),
    {
      maintenanceMode: Boolean(enabled),
      maintenanceMessage: message || DEFAULT_MAINTENANCE_MESSAGE,
      maintenanceUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function deleteAllTopicContentAllCourses(onProgress) {
  const coursesSnap = await getDocs(collection(db, 'courses'))
  const activeCourses = coursesSnap.docs.filter((d) => d.data().active !== false)

  let totalDeleted = 0
  const summary = []

  for (const courseDoc of activeCourses) {
    const courseId = courseDoc.id
    const courseName = courseDoc.data().name || courseDoc.data().competition || courseId
    let courseDeleted = 0

    onProgress?.(`🗑️ ${courseName} — apagando conteúdos gerados…`)

    for (const sub of TOPIC_SUBCOLLECTIONS) {
      const subSnap = await getDocs(collection(db, 'courses', courseId, sub))
      if (subSnap.docs.length) {
        const n = await deleteDocsInBatches(subSnap.docs)
        courseDeleted += n
        totalDeleted += n
      }
    }

    try {
      const legacyQuestoesSnap = await getDocs(collection(db, 'courses', courseId, 'questoes'))
      if (legacyQuestoesSnap.docs.length) {
        const withTopic = legacyQuestoesSnap.docs.filter((d) => d.data().topicKey)
        if (withTopic.length) {
          const n = await deleteDocsInBatches(withTopic)
          courseDeleted += n
          totalDeleted += n
        }
      }
    } catch (err) {
      console.warn('[deleteAllTopicContent] questoes legado:', err.message)
    }

    try {
      const globalCardsSnap = await getDocs(
        query(collection(db, 'flashcards'), where('courseId', '==', courseId)),
      )
      if (globalCardsSnap.docs.length) {
        const n = await deleteDocsInBatches(globalCardsSnap.docs)
        courseDeleted += n
        totalDeleted += n
      }
    } catch (err) {
      console.warn('[deleteAllTopicContent] flashcards global:', err.message)
    }

    summary.push({ courseId, courseName, deleted: courseDeleted })
    onProgress?.(`✅ ${courseName}: ${courseDeleted} item(ns) apagado(s)`)
  }

  return { totalDeleted, courses: summary.length, summary }
}

function todayKeySaoPaulo() {
  return dayjs().tz('America/Sao_Paulo').format('YYYY-MM-DD')
}

async function collectCronogramaDayKeysClient(courseId, endDate) {
  const cronogramaSnap = await getDocs(collection(db, 'courses', courseId, 'cronograma'))
  const dayKeys = []

  for (const monthDoc of cronogramaSnap.docs) {
    const days = monthDoc.data().days || {}
    for (const [dateKey, entry] of Object.entries(days)) {
      if (dateKey > endDate) continue
      const tipo = entry.type || entry.tipo || 'estudo'
      if (tipo === 'simulado' || tipo === 'descanso') continue
      dayKeys.push(dateKey)
    }
  }

  return [...new Set(dayKeys)].sort()
}

const ACTIVE_BACKFILL_STATUSES = [
  'pending',
  'running',
  'waiting_api',
  'waiting_retry',
  'waiting_timeout',
]

async function hasActiveBackfillJob(userId, courseId) {
  const snap = await getDocs(
    query(
      collection(db, 'users', userId, 'generationJobs'),
      where('courseId', '==', courseId),
      where('jobType', '==', 'guia_mentorado_backfill'),
      where('status', 'in', ACTIVE_BACKFILL_STATUSES),
    ),
  )
  return snap.docs.length > 0
}

export async function startMentoradoBackfillAllCourses(userId, onProgress) {
  if (!userId) throw new Error('Usuário não autenticado.')

  const todayKey = todayKeySaoPaulo()
  const coursesSnap = await getDocs(collection(db, 'courses'))
  const activeCourses = coursesSnap.docs.filter((d) => d.data().active !== false)

  const jobs = []
  const MAX_PARALLEL_BACKFILL = 1
  let started = 0

  for (const courseDoc of activeCourses) {
    const courseId = courseDoc.id
    const courseName = courseDoc.data().name || courseDoc.data().competition || courseId

    if (started >= MAX_PARALLEL_BACKFILL) {
      onProgress?.(
        `⏸️ ${courseName}: só 1 backfill por vez — aguarde o atual terminar e rode de novo para os demais cursos.`,
      )
      continue
    }

    const configSnap = await getDoc(doc(db, 'courses', courseId, 'config', 'guiaMentorado'))
    if (!configSnap.exists() || !configSnap.data().autoGerarConteudo) {
      onProgress?.(`⏭️ ${courseName}: automação do Guia Mentorado desativada — pulando`)
      continue
    }

    const dayKeys = await collectCronogramaDayKeysClient(courseId, todayKey)
    if (!dayKeys.length) {
      onProgress?.(`⏭️ ${courseName}: sem dias no cronograma até hoje — pulando`)
      continue
    }

    if (await hasActiveBackfillJob(userId, courseId)) {
      onProgress?.(`⏭️ ${courseName}: já existe backfill em andamento — pulando`)
      continue
    }

    onProgress?.(`🚀 ${courseName}: iniciando geração de ${dayKeys.length} dia(s)…`)

    const { jobId } = await startBackgroundGeneration({
      userId,
      courseId,
      jobType: 'guia_mentorado_backfill',
      topicKey: null,
      metadata: {
        dayCount: dayKeys.length,
        firstDay: dayKeys[0],
        lastDay: dayKeys[dayKeys.length - 1],
        courseName,
      },
      runOnServer: true,
      serverPayload: {
        courseId,
        dayKeys,
      },
    })

    jobs.push({ courseId, courseName, jobId, dayCount: dayKeys.length })
    started += 1
  }

  if (!jobs.length) {
    throw new Error(
      'Nenhum curso elegível. Ative a automação do Guia Mentorado e gere o cronograma antes.',
    )
  }

  return { jobs, todayKey }
}

export { DEFAULT_MAINTENANCE_MESSAGE }
