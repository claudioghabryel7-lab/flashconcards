/**
 * Professor IA — tick local enquanto o admin está online.
 * Respeita janela De/Até; se o horário chegou e a sessão não iniciou, inicia (catch-up).
 * Processa sinalizações da Moderação uma a uma.
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  getTodayKeyInSaoPaulo,
  isWithinProfessorWindow,
  setProfessorSupervisorEnabled,
  formatScheduleWindowLabel,
  formatDailyStartLabel,
} from './professorSupervisorService'
import { startBackgroundGeneration, getActiveGenerationCount } from './aiGenerationRunner'
import {
  fetchNextOpenFlag,
  patchProfessorActivity,
} from './localProfessorFlagProcessor'

let busy = false

async function endSessionOutsideWindow(data) {
  const label = formatScheduleWindowLabel(data)
  await setDoc(
    doc(db, 'config', 'professorFiscalizador'),
    {
      enabled: false,
      phase: data.recurringDaily ? 'waiting_daily' : 'idle',
      currentActivity: {
        phase: data.recurringDaily ? 'waiting_daily' : 'idle',
        message: data.recurringDaily
          ? `Janela encerrada — próxima ${label} (seg–dom)`
          : 'Sessão encerrada.',
        updatedAt: serverTimestamp(),
      },
      lastMessage: data.recurringDaily ? `Aguardando janela ${label}` : 'Sessão encerrada.',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function tickProfessorOnline(adminUserId) {
  if (!db || !adminUserId || busy) return { skipped: true, reason: 'busy' }
  if (typeof document !== 'undefined' && document.hidden) {
    return { skipped: true, reason: 'tab_hidden' }
  }
  if (getActiveGenerationCount() > 0) {
    return { skipped: true, reason: 'generation_active' }
  }

  busy = true
  try {
    const snap = await getDoc(doc(db, 'config', 'professorFiscalizador'))
    let data = snap.exists() ? snap.data() : {}

    if (!data.recurringDaily && !data.enabled) {
      return { skipped: true, reason: 'off' }
    }

    const todayKey = getTodayKeyInSaoPaulo()
    const within = isWithinProfessorWindow(data)

    // Catch-up: agenda ligada, horário ok, sessão ainda não ativa hoje
    if (data.recurringDaily && !data.enabled && within) {
      if (data.lastAutoStartDate === todayKey && data.phase === 'session_expired') {
        return { skipped: true, reason: 'session_done_today', checked: true }
      }
      await setProfessorSupervisorEnabled(adminUserId, true, {
        startHour: data.windowStartHour ?? data.dailyStartHour,
        startMinute: data.windowStartMinute ?? data.dailyStartMinute,
        endHour: data.windowEndHour,
        endMinute: data.windowEndMinute,
      })
      const refreshed = await getDoc(doc(db, 'config', 'professorFiscalizador'))
      data = refreshed.exists() ? refreshed.data() : data
    }

    if (data.recurringDaily && !within) {
      if (data.enabled) await endSessionOutsideWindow(data)
      return {
        skipped: true,
        reason: 'fora_janela',
        next: formatDailyStartLabel(
          data.windowStartHour ?? data.dailyStartHour ?? 0,
          data.windowStartMinute ?? data.dailyStartMinute ?? 0,
        ),
      }
    }

    if (!data.enabled) {
      return { skipped: true, reason: 'waiting_window' }
    }

    const flag = await fetchNextOpenFlag()
    if (!flag) {
      await patchProfessorActivity({
        phase: 'idle_queue',
        lastMessage: 'Fila vazia — aguardando novas sinalizações da Moderação.',
        currentActivity: {
          phase: 'idle_queue',
          message: 'Online — sem sinalizações abertas.',
          progress: 100,
          updatedAt: serverTimestamp(),
        },
      })
      return { skipped: true, reason: 'empty', checked: true }
    }

    const label = `Sinalização (${flag.contentType || 'conteúdo'})`
    await patchProfessorActivity({
      phase: 'running',
      lastMessage: `Corrigindo: ${label}`,
      currentActivity: {
        phase: 'running',
        message: `Fiscalizando: ${label}`,
        itemType: 'flag',
        courseId: flag.courseId,
        label,
        professorStep: 'iniciando',
        progress: 5,
        updatedAt: serverTimestamp(),
      },
    })

    const { promise } = await startBackgroundGeneration({
      userId: adminUserId,
      courseId: flag.courseId,
      jobType: 'professor_supervisor',
      metadata: { flagId: flag.id, source: 'admin_online' },
      serverPayload: {
        itemType: 'flag',
        payload: {
          flagId: flag.id,
          contentType: flag.contentType,
          contentId: flag.contentId,
          topicKey: flag.topicKey,
          preview: flag.preview,
          reportText: flag.text,
          topicoNome: flag.topicoNome,
        },
      },
    })

    promise
      .then(async (result) => {
        await patchProfessorActivity({
          phase: 'idle_queue',
          lastMessage: result?.summary || 'Correção concluída.',
          itemsProcessedSession: Number(data.itemsProcessedSession || 0) + 1,
          currentActivity: {
            phase: 'done_item',
            message: result?.summary || 'Correção aplicada',
            progress: 100,
            updatedAt: serverTimestamp(),
          },
        })
      })
      .catch(async (err) => {
        await patchProfessorActivity({
          phase: 'error',
          lastMessage: err?.message || 'Erro na correção',
          currentActivity: {
            phase: 'error',
            message: err?.message || 'Erro',
            progress: 100,
            updatedAt: serverTimestamp(),
          },
        })
      })

    return { started: true, flagId: flag.id, courseId: flag.courseId }
  } finally {
    busy = false
  }
}
