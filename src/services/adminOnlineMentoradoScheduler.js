/**
 * Guia Mentorado — tick local enquanto o admin está online.
 * Se o horário do dia já passou e ainda não rodou hoje → gera agora.
 * Se já rodou hoje → só confirma (skip).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { normalizeMentoradoAutomationConfig } from '../utils/guiaMentoradoAutomationConfig'
import { startMentoradoDayContentAutomation } from './guiaMentoradoAutomationService'
import { getActiveGenerationCount } from './aiGenerationRunner'

function getTodayKeyInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date)
}

function getSaoPauloClockParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  if (hour === 24) hour = 0
  return {
    hour,
    minute: Number(parts.find((p) => p.type === 'minute')?.value ?? 0),
  }
}

function isPastReleaseTime(automation, clock) {
  const h = automation?.schedule?.dailyReleaseHour ?? 0
  const m = automation?.schedule?.dailyReleaseMinute ?? 0
  const nowMin = clock.hour * 60 + clock.minute
  const releaseMin = h * 60 + m
  return nowMin >= releaseMin
}

async function markDailyChecked(courseId, todayKey, extra = {}) {
  const ref = doc(db, 'courses', courseId, 'config', 'guiaMentorado')
  await setDoc(
    ref,
    {
      automation: {
        lastDailyRunDayKey: todayKey,
        lastDailyRunAt: serverTimestamp(),
        lastError: extra.lastError ?? null,
        ...(extra.started ? { lastDailyStartedAt: serverTimestamp() } : {}),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

let busy = false

/**
 * Varre cursos e dispara o dia de hoje se a programação pediu e ainda não rodou.
 */
export async function tickMentoradoDailyOnline(adminUserId) {
  if (!db || !adminUserId || busy) return { skipped: true, reason: 'busy' }
  if (typeof document !== 'undefined' && document.hidden) {
    return { skipped: true, reason: 'tab_hidden' }
  }
  if (getActiveGenerationCount() > 0) {
    return { skipped: true, reason: 'generation_active' }
  }

  busy = true
  const todayKey = getTodayKeyInSaoPaulo()
  const clock = getSaoPauloClockParts()
  const results = []

  try {
    const coursesSnap = await getDocs(collection(db, 'courses'))
    for (const courseDoc of coursesSnap.docs) {
      const courseId = courseDoc.id
      if (courseDoc.data()?.active === false) continue

      try {
        const cfgSnap = await getDoc(doc(db, 'courses', courseId, 'config', 'guiaMentorado'))
        if (!cfgSnap.exists()) {
          results.push({ courseId, skipped: true, reason: 'sem_config' })
          continue
        }

        const automation = normalizeMentoradoAutomationConfig(cfgSnap.data())
        if (!automation.enabled) {
          results.push({ courseId, skipped: true, reason: 'desligado' })
          continue
        }
        if (!automation.triggers.onDailyCron) {
          results.push({ courseId, skipped: true, reason: 'cron_off' })
          continue
        }

        // Já ativou hoje → só checking
        if (automation.lastDailyRunDayKey === todayKey) {
          results.push({ courseId, skipped: true, reason: 'ja_rodou_hoje', checked: true })
          continue
        }

        // Ainda não chegou o horário → espera
        if (!isPastReleaseTime(automation, clock)) {
          results.push({
            courseId,
            skipped: true,
            reason: 'antes_do_horario',
            at: `${String(automation.schedule.dailyReleaseHour).padStart(2, '0')}:${String(automation.schedule.dailyReleaseMinute).padStart(2, '0')}`,
          })
          continue
        }

        // Horário passou e ainda não rodou → catch-up agora (admin online)
        const userId = automation.automationUserId || adminUserId
        const { jobId, promise, topicCount } = await startMentoradoDayContentAutomation({
          userId,
          courseId,
          targetDate: todayKey,
          autoPublish: true,
        })

        await markDailyChecked(courseId, todayKey, { started: true })
        results.push({ courseId, started: true, jobId, topicCount })

        // Um curso por tick — evita saturar a aba
        promise.catch(() => {})
        break
      } catch (err) {
        const message = err?.message || String(err)
        results.push({ courseId, error: message })
        // Dias sem cronograma/edital: marca o dia para não martelar a cada minuto
        if (/não encontrado|Nenhum tópico|sem conteúdos/i.test(message)) {
          await markDailyChecked(courseId, todayKey, { lastError: message }).catch(() => {})
        }
      }
    }
  } finally {
    busy = false
  }

  return { ok: true, todayKey, results }
}
