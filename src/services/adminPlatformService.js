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
import { db, auth } from '../firebase/config'
import { FIREBASE_FUNCTIONS } from '../config/firebaseFunctions'
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import {
  startMentoradoBackfillJob,
} from './guiaMentoradoAutomationService'

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

async function hasActiveBackfillJob(userId, courseId) {
  const snap = await getDocs(
    query(
      collection(db, 'users', userId, 'generationJobs'),
      where('courseId', '==', courseId),
      where('jobType', '==', 'guia_mentorado_backfill'),
      where('status', 'in', ACTIVE_JOB_STATUSES),
    ),
  )
  return !snap.empty
}

/**
 * Backfill unificado: 1 job na nuvem (guia_mentorado_backfill) do 1º dia até hoje.
 */
export async function startMentoradoBackfillForCourse({
  userId,
  courseId,
  courseName,
  editalVerticalizado: editalPrefetched = null,
  onProgress,
}) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!courseId) throw new Error('Curso não selecionado.')

  const todayKey = todayKeySaoPaulo()
  const name = courseName || courseId

  if (await hasActiveBackfillJob(userId, courseId)) {
    throw new Error(`Já existe backfill em andamento para ${name}.`)
  }

  const dayKeys = await collectCronogramaDayKeysClient(courseId, todayKey)
  if (!dayKeys.length) {
    throw new Error('Nenhum dia de estudo no cronograma até hoje.')
  }

  onProgress?.(`📖 ${name}: validando edital…`)
  const editalVerticalizado =
    editalPrefetched || (await loadEditalVerticalizado(courseId))
  if (!editalVerticalizado?.disciplinas?.length) {
    throw new Error('Edital verticalizado não encontrado.')
  }

  // Pula dias já completos — envia só o que falta (ou deixa o servidor varrer tudo)
  const pendingDayKeys = []
  for (const dayKey of dayKeys) {
    if (await isDayFullyDone(courseId, dayKey)) {
      onProgress?.(`✅ ${name} ${dayKey}: já completo — pulando`)
      continue
    }
    pendingDayKeys.push(dayKey)
  }

  if (!pendingDayKeys.length) {
    throw new Error(
      'Nada pendente neste curso até hoje. Todos os dias já estão gerados.',
    )
  }

  onProgress?.(
    `🚀 ${name}: enfileirando backfill (${pendingDayKeys.length} dia(s)) na nuvem…`,
  )

  const { jobId } = await startMentoradoBackfillJob({
    userId,
    courseId,
    dayKeys: pendingDayKeys,
  })

  onProgress?.(
    `✅ ${name}: backfill iniciado (1 job) — acompanhe no banner.`,
  )

  return {
    jobs: [{ courseId, courseName: name, jobId, dayKey: pendingDayKeys[0], topicCount: null }],
    todayKey,
    dayCount: pendingDayKeys.length,
    jobId,
  }
}

/**
 * Backfill em massa: 1 curso por vez (cursos com automação ativa).
 */
export async function startMentoradoBackfillAllCourses(userId, onProgress) {
  if (!userId) throw new Error('Usuário não autenticado.')

  const coursesSnap = await getDocs(collection(db, 'courses'))
  const activeCourses = coursesSnap.docs.filter((d) => d.data().active !== false)

  const jobs = []
  const MAX_COURSES_PER_RUN = 1
  let coursesStarted = 0
  let todayKey = todayKeySaoPaulo()

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
    const rawCfg = configSnap.exists() ? configSnap.data() : null
    const enabled =
      rawCfg?.automation?.enabled !== undefined
        ? Boolean(rawCfg.automation.enabled)
        : Boolean(rawCfg?.autoGerarConteudo)
    const allowBackfill = rawCfg?.automation?.triggers?.allowBackfill !== false
    if (!rawCfg || !enabled) {
      onProgress?.(`⏭️ ${courseName}: automação do Guia Mentorado desativada — pulando`)
      continue
    }
    if (!allowBackfill) {
      onProgress?.(`⏭️ ${courseName}: backfill desabilitado na config — pulando`)
      continue
    }

    try {
      const result = await startMentoradoBackfillForCourse({
        userId,
        courseId,
        courseName,
        onProgress,
      })
      jobs.push(...result.jobs)
      todayKey = result.todayKey
      coursesStarted += 1
    } catch (err) {
      onProgress?.(`⏭️ ${courseName}: ${err.message || err}`)
    }
  }

  if (!jobs.length) {
    throw new Error(
      'Nada para gerar. Confira se a automação está ativa, se há cronograma e se ainda falta conteúdo até hoje.',
    )
  }

  return { jobs, todayKey }
}

/**
 * Lista jobs de geração ativos em toda a plataforma (admin, via Cloud Function).
 */
export async function listActiveGenerationJobs({ limit = 50 } = {}) {
  const user = auth?.currentUser
  if (!user) throw new Error('Não autenticado')
  if (!FIREBASE_FUNCTIONS.listActiveGenerationJobs) {
    throw new Error('Endpoint listActiveGenerationJobs não configurado')
  }
  const token = await user.getIdToken()
  const response = await fetch(FIREBASE_FUNCTIONS.listActiveGenerationJobs, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ limit }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Falha ao listar jobs ativos')
  }
  return data
}

export { DEFAULT_MAINTENANCE_MESSAGE }
