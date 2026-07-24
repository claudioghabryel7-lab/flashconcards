/**
 * Professor IA — tick local enquanto QUALQUER usuário autenticado está online.
 * Moderação: corrige sinalizações automaticamente (não precisa abrir o painel Admin).
 * Agenda De/Até: controla sessão/UI e rotação semanal de redação.
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  getTodayKeyInSaoPaulo,
  isWithinProfessorWindow,
  setProfessorSupervisorEnabled,
  formatScheduleWindowLabel,
} from './professorSupervisorService'
import { startBackgroundGeneration, getActiveGenerationCount } from './aiGenerationRunner'
import {
  fetchNextOpenFlag,
  patchProfessorActivity,
  reclaimStaleInReviewFlags,
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

async function startFlagCorrection(adminUserId, flag, data = {}) {
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
        disciplinaNome: flag.disciplinaNome,
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
}

/**
 * Força 1 correção da Moderação agora (ignora agenda/janela).
 */
export async function forceProcessModerationNow(adminUserId) {
  if (!db || !adminUserId) throw new Error('Admin não autenticado.')
  if (busy) throw new Error('Professor já está processando. Aguarde alguns segundos.')
  if (getActiveGenerationCount() > 0) {
    throw new Error('Há outra geração em andamento. Aguarde terminar.')
  }

  busy = true
  try {
    await reclaimStaleInReviewFlags()
    const flag = await fetchNextOpenFlag()
    if (!flag) {
      await patchProfessorActivity({
        phase: 'idle_queue',
        lastMessage: 'Nenhuma sinalização aberta na Moderação.',
        currentActivity: {
          phase: 'idle_queue',
          message: 'Moderação vazia',
          progress: 100,
          updatedAt: serverTimestamp(),
        },
      })
      return { skipped: true, reason: 'empty' }
    }

    const snap = await getDoc(doc(db, 'config', 'professorFiscalizador'))
    const data = snap.exists() ? snap.data() : {}
    return await startFlagCorrection(adminUserId, flag, data)
  } finally {
    busy = false
  }
}

/**
 * @param {string} userId — uid de quem está online (admin ou aluno)
 * @param {{ allowRedacaoWeekly?: boolean }} [options]
 *   allowRedacaoWeekly: só admin (grava tema + notifica alunos)
 */
export async function tickProfessorOnline(userId, options = {}) {
  const allowRedacaoWeekly = options.allowRedacaoWeekly === true
  if (!db || !userId || busy) return { skipped: true, reason: 'busy' }
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

    const todayKey = getTodayKeyInSaoPaulo()
    const within = isWithinProfessorWindow(data)

    // Catch-up de sessão (agenda) — opcional
    if (data.recurringDaily && !data.enabled && within) {
      if (!(data.lastAutoStartDate === todayKey && data.phase === 'session_expired')) {
        await setProfessorSupervisorEnabled(userId, true, {
          startHour: data.windowStartHour ?? data.dailyStartHour,
          startMinute: data.windowStartMinute ?? data.dailyStartMinute,
          endHour: data.windowEndHour,
          endMinute: data.windowEndMinute,
        })
        const refreshed = await getDoc(doc(db, 'config', 'professorFiscalizador'))
        data = refreshed.exists() ? refreshed.data() : data
      }
    }

    if (data.recurringDaily && !within && data.enabled) {
      await endSessionOutsideWindow(data)
    }

    // Redação semanal: só com admin (escreve config/redacao + notifica outros usuários)
    if (allowRedacaoWeekly) {
      try {
        const { tickProfessorRedacaoWeekly } = await import('./localProfessorRedacao')
        const redacaoTick = await tickProfessorRedacaoWeekly()
        if (redacaoTick?.didRotate) {
          const first = redacaoTick.rotated?.[0]
          await patchProfessorActivity({
            phase: 'idle_queue',
            lastMessage: `Tema de redação da semana publicado${
              first?.tema ? `: ${String(first.tema).slice(0, 80)}…` : '.'
            } (${first?.notified || 0} aluno(s) avisados).`,
            itemsProcessedSession: Number(data.itemsProcessedSession || 0) + 1,
            currentActivity: {
              phase: 'done_item',
              message: 'Redação semanal — novo tema',
              itemType: 'redacao',
              courseId: first?.courseId || null,
              progress: 100,
              updatedAt: serverTimestamp(),
            },
          })
          return { started: true, kind: 'redacao_theme', courseId: first?.courseId }
        }
      } catch (redacaoErr) {
        console.warn('[professorOnline] redação semanal:', redacaoErr?.message || redacaoErr)
      }
    }

    // Moderação: SEMPRE com alguém online (qualquer página), independente da agenda
    await reclaimStaleInReviewFlags()
    const flag = await fetchNextOpenFlag()
    if (!flag) {
      await patchProfessorActivity({
        phase: 'idle_queue',
        lastMessage:
          'Fila vazia — Moderação ok. Aguardando novas sinalizações (usuário online no site).',
        currentActivity: {
          phase: 'idle_queue',
          message: data.recurringDaily && !within
            ? 'Fora da janela de agenda — Moderação continua sendo corrigida com usuário online.'
            : 'Usuário online — Moderação em dia.',
          progress: 100,
          updatedAt: serverTimestamp(),
        },
      })
      return { skipped: true, reason: 'empty', checked: true }
    }

    return await startFlagCorrection(userId, flag, data)
  } finally {
    busy = false
  }
}
