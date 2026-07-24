/**
 * Guia Mentorado — tick local enquanto QUALQUER usuário autenticado está online.
 * 1) Se não há cronograma → gera determinístico (sem IA)
 * 2) Se o horário do dia já passou e ainda não rodou → gera conteúdos do dia
 * 3) Redação: a cada 7 dias, se não gerou tema → rotaciona (fallback)
 *
 * Alunos alimentam a automação em segundo plano (sem UI de controle).
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
import {
  startGuiaMentoradoCronogramaGeneration,
  startMentoradoDayContentAutomation,
} from './guiaMentoradoAutomationService'
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

async function courseHasCronogramaDay(courseId, dayKey) {
  const monthKey = String(dayKey || '').slice(0, 7)
  if (!monthKey) return false
  const snap = await getDoc(doc(db, 'courses', courseId, 'cronograma', monthKey))
  if (!snap.exists()) return false
  return Boolean(snap.data()?.days?.[dayKey])
}

async function loadMentoradoConfigForCronograma(courseId) {
  const [cfgSnap, guiaSnap] = await Promise.all([
    getDoc(doc(db, 'courses', courseId, 'config', 'guiaMentorado')),
    getDoc(doc(db, 'courses', courseId, 'guiaMentorado', 'config')),
  ])
  return {
    ...(guiaSnap.exists() ? guiaSnap.data() : {}),
    ...(cfgSnap.exists() ? cfgSnap.data() : {}),
  }
}

let busy = false

/**
 * Varre cursos: cronograma faltando → gera; depois dia de hoje; depois redação 7d (só admin).
 * @param {string} userId
 * @param {{ allowRedacaoWeekly?: boolean }} [options]
 */
export async function tickMentoradoDailyOnline(userId, options = {}) {
  const allowRedacaoWeekly = options.allowRedacaoWeekly === true
  if (!db || !userId || busy) return { skipped: true, reason: 'busy' }
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

        const rawCfg = cfgSnap.data() || {}
        const automation = normalizeMentoradoAutomationConfig(rawCfg)
        if (!automation.enabled) {
          results.push({ courseId, skipped: true, reason: 'desligado' })
          continue
        }
        if (!automation.triggers.onDailyCron) {
          results.push({ courseId, skipped: true, reason: 'cron_off' })
          continue
        }

        // Jobs ficam sob o uid de quem está online (aluno não grava na pasta de outro user)
        const runAsUserId = userId

        // 1) Sem dia no cronograma → gera bot (precisa data da prova)
        const hasDay = await courseHasCronogramaDay(courseId, todayKey)
        if (!hasDay) {
          const config = await loadMentoradoConfigForCronograma(courseId)
          if (!config.dataProva && !automation.dataProva) {
            results.push({
              courseId,
              skipped: true,
              reason: 'sem_data_prova',
            })
            continue
          }
          const { jobId, promise, duplicate } = await startGuiaMentoradoCronogramaGeneration({
            userId: runAsUserId,
            courseId,
            config: {
              ...config,
              hasRedacao: config.hasRedacao ?? automation.hasRedacao,
              hasTAF: config.hasTAF ?? automation.hasTAF,
              tafExercicios: config.tafExercicios || automation.tafExercicios || [],
              dataProva: config.dataProva || automation.dataProva || null,
              autoGerarConteudo: true,
            },
          })
          results.push({
            courseId,
            started: !duplicate,
            duplicate: Boolean(duplicate),
            jobId,
            kind: 'cronograma',
          })
          promise?.catch(() => {})
          break
        }

        // 2) Já ativou conteúdos hoje → segue para redação fallback abaixo
        if (automation.lastDailyRunDayKey === todayKey) {
          results.push({ courseId, skipped: true, reason: 'ja_rodou_hoje', checked: true })
        } else if (!isPastReleaseTime(automation, clock)) {
          results.push({
            courseId,
            skipped: true,
            reason: 'antes_do_horario',
            at: `${String(automation.schedule.dailyReleaseHour).padStart(2, '0')}:${String(automation.schedule.dailyReleaseMinute).padStart(2, '0')}`,
          })
        } else {
          await markDailyChecked(courseId, todayKey, { started: true })

          try {
            const { jobId, promise, topicCount, duplicate } = await startMentoradoDayContentAutomation({
              userId: runAsUserId,
              courseId,
              targetDate: todayKey,
              autoPublish: true,
            })

            results.push({
              courseId,
              started: !duplicate,
              duplicate: Boolean(duplicate),
              jobId,
              topicCount,
              kind: 'dia',
            })

            promise?.catch(() => {})
            break
          } catch (startErr) {
            if (startErr?.code === 'duplicate_generation_job') {
              results.push({
                courseId,
                skipped: true,
                reason: 'job_duplicado',
                existingJobId: startErr.existingJobId,
              })
              break
            }
            throw startErr
          }
        }
      } catch (err) {
        const message = err?.message || String(err)
        results.push({ courseId, error: message })
        if (/não encontrado|Nenhum tópico|sem conteúdos/i.test(message)) {
          await markDailyChecked(courseId, todayKey, { lastError: message }).catch(() => {})
        }
      }
    }

    // 3) Fallback redação a cada 7 dias — só admin (grava tema + notifica)
    if (allowRedacaoWeekly && getActiveGenerationCount() === 0) {
      try {
        const { tickProfessorRedacaoWeekly } = await import('./localProfessorRedacao')
        const redacaoTick = await tickProfessorRedacaoWeekly()
        if (redacaoTick?.didRotate) {
          results.push({
            kind: 'redacao_theme',
            started: true,
            courseId: redacaoTick.rotated?.[0]?.courseId,
            tema: redacaoTick.rotated?.[0]?.tema,
          })
        }
      } catch (redacaoErr) {
        console.warn('[mentoradoOnline] redação semanal:', redacaoErr?.message || redacaoErr)
      }
    }
  } finally {
    busy = false
  }

  return { ok: true, todayKey, results }
}
