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
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import { startMentoradoDayContentAutomation } from './guiaMentoradoAutomationService'

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

const ACTIVE_JOB_STATUSES = [
  'pending',
  'running',
  'waiting_api',
  'waiting_retry',
  'waiting_timeout',
]

async function isDayFullyDone(courseId, dayKey) {
  const snap = await getDoc(doc(db, 'courses', courseId, 'mentoradoAutomation', dayKey))
  if (!snap.exists()) return false
  const data = snap.data()
  if (data.status === 'done') return true
  const total = Number(data.totalTopics) || 0
  const published = Number(data.publishedCount) || 0
  return total > 0 && published >= total
}

async function hasActiveDayAutomationJob(userId, courseId, targetDate) {
  const snap = await getDocs(
    query(
      collection(db, 'users', userId, 'generationJobs'),
      where('courseId', '==', courseId),
      where('jobType', '==', 'guia_mentorado_automation'),
      where('status', 'in', ACTIVE_JOB_STATUSES),
    ),
  )
  return snap.docs.some((d) => {
    const data = d.data()
    return (
      data?.serverPayload?.targetDate === targetDate ||
      data?.metadata?.targetDate === targetDate
    )
  })
}

/**
 * Mesmo fluxo do botão "Gerar conteúdos de hoje", repetido para cada dia
 * do cronograma desde o primeiro até hoje (só o que ainda falta).
 */
export async function startMentoradoBackfillAllCourses(userId, onProgress) {
  if (!userId) throw new Error('Usuário não autenticado.')

  const todayKey = todayKeySaoPaulo()
  const coursesSnap = await getDocs(collection(db, 'courses'))
  const activeCourses = coursesSnap.docs.filter((d) => d.data().active !== false)

  const jobs = []
  const MAX_COURSES_PER_RUN = 1
  let coursesStarted = 0

  for (const courseDoc of activeCourses) {
    const courseId = courseDoc.id
    const courseName = courseDoc.data().name || courseDoc.data().competition || courseId

    if (coursesStarted >= MAX_COURSES_PER_RUN) {
      onProgress?.(
        `⏸️ ${courseName}: só 1 curso por vez — rode de novo depois que o atual terminar.`,
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

    onProgress?.(`📖 ${courseName}: carregando edital…`)
    const editalVerticalizado = await loadEditalVerticalizado(courseId)
    if (!editalVerticalizado?.disciplinas?.length) {
      onProgress?.(`⏭️ ${courseName}: edital verticalizado ausente — pulando`)
      continue
    }

    let startedForCourse = 0

    for (const dayKey of dayKeys) {
      if (await isDayFullyDone(courseId, dayKey)) {
        onProgress?.(`✅ ${courseName} ${dayKey}: já completo — pulando`)
        continue
      }

      if (await hasActiveDayAutomationJob(userId, courseId, dayKey)) {
        onProgress?.(`⏭️ ${courseName} ${dayKey}: já tem job ativo — pulando`)
        continue
      }

      try {
        onProgress?.(
          `🚀 ${courseName}: gerando dia ${dayKey} (${startedForCourse + 1}/${dayKeys.length})…`,
        )
        const { jobId, topicCount } = await startMentoradoDayContentAutomation({
          userId,
          courseId,
          targetDate: dayKey,
          editalVerticalizado,
          autoPublish: true,
        })
        jobs.push({ courseId, courseName, jobId, dayKey, topicCount })
        startedForCourse += 1
      } catch (err) {
        const msg = err?.message || String(err)
        if (/já estão gerados|não encontrado|Nenhum tópico|descanso|simulado/i.test(msg)) {
          onProgress?.(`⏭️ ${courseName} ${dayKey}: ${msg}`)
        } else {
          onProgress?.(`⚠️ ${courseName} ${dayKey}: ${msg}`)
        }
      }
    }

    if (startedForCourse > 0) {
      coursesStarted += 1
      onProgress?.(
        `✅ ${courseName}: ${startedForCourse} dia(s) enfileirado(s) com o mesmo fluxo de “Gerar conteúdos de hoje”.`,
      )
    } else {
      onProgress?.(`⏭️ ${courseName}: nada pendente até hoje`)
    }
  }

  if (!jobs.length) {
    throw new Error(
      'Nada para gerar. Confira se a automação está ativa, se há cronograma e se ainda falta conteúdo até hoje.',
    )
  }

  return { jobs, todayKey }
}

export { DEFAULT_MAINTENANCE_MESSAGE }
