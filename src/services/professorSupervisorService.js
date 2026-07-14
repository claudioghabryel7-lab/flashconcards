import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase/config'

const CONFIG_PATH = ['config', 'professorFiscalizador']

export function getSaoPauloClockParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  return {
    hour: Number(parts.find((p) => p.type === 'hour')?.value ?? 0),
    minute: Number(parts.find((p) => p.type === 'minute')?.value ?? 0),
  }
}

export function getTodayKeyInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date)
}

export function formatDailyStartLabel(hour = 0, minute = 0) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function formatScheduleWindowLabel(cfg = {}) {
  const start = formatDailyStartLabel(cfg.windowStartHour ?? cfg.dailyStartHour ?? 0, cfg.windowStartMinute ?? cfg.dailyStartMinute ?? 0)
  const end = formatDailyStartLabel(cfg.windowEndHour ?? 18, cfg.windowEndMinute ?? 0)
  return `${start}–${end}`
}

/** Minutos desde meia-noite. */
function toMinutes(hour, minute) {
  return Number(hour || 0) * 60 + Number(minute || 0)
}

export function isWithinProfessorWindow(cfg = {}, date = new Date()) {
  const startH = cfg.windowStartHour ?? cfg.dailyStartHour ?? 0
  const startM = cfg.windowStartMinute ?? cfg.dailyStartMinute ?? 0
  const endH = cfg.windowEndHour ?? 18
  const endM = cfg.windowEndMinute ?? 0
  const now = getSaoPauloClockParts(date)
  const nowMin = toMinutes(now.hour, now.minute)
  const startMin = toMinutes(startH, startM)
  const endMin = toMinutes(endH, endM)
  if (endMin > startMin) {
    return nowMin >= startMin && nowMin < endMin
  }
  return nowMin >= startMin || nowMin < endMin
}

/**
 * Próximo início da janela (Brasília) e countdown legível.
 */
export function getProfessorNextWindowInfo(cfg = {}, date = new Date()) {
  const startH = Number(cfg.windowStartHour ?? cfg.dailyStartHour ?? 0)
  const startM = Number(cfg.windowStartMinute ?? cfg.dailyStartMinute ?? 0)
  const endH = Number(cfg.windowEndHour ?? 18)
  const endM = Number(cfg.windowEndMinute ?? 0)
  const within = isWithinProfessorWindow(cfg, date)
  const label = formatScheduleWindowLabel(cfg)

  if (!cfg.recurringDaily) {
    return {
      status: 'off',
      label: 'Agenda desativada',
      countdown: null,
      within: false,
      windowLabel: label,
    }
  }

  if (within && cfg.enabled) {
    const ends = cfg.sessionEndsAt?.toDate?.()
    const rem = ends ? Math.max(0, ends.getTime() - date.getTime()) : 0
    return {
      status: 'live',
      label: `Online agora (${label})`,
      countdown: rem > 0 ? formatDurationMs(rem) : null,
      within: true,
      windowLabel: label,
    }
  }

  if (within && !cfg.enabled) {
    return {
      status: 'in_window_idle',
      label: `Dentro da janela ${label} — o tick deve iniciar em até ~1 min`,
      countdown: null,
      within: true,
      windowLabel: label,
    }
  }

  // Fora da janela: tempo até o próximo início
  const now = getSaoPauloClockParts(date)
  const nowMin = toMinutes(now.hour, now.minute)
  const startMin = toMinutes(startH, startM)
  const endMin = toMinutes(endH, endM)
  const overnight = endMin <= startMin

  let minutesUntilStart
  if (!overnight) {
    if (nowMin < startMin) minutesUntilStart = startMin - nowMin
    else minutesUntilStart = 24 * 60 - nowMin + startMin
  } else if (nowMin >= endMin && nowMin < startMin) {
    minutesUntilStart = startMin - nowMin
  } else {
    // Já na parte overnight ativa ou após início — tratado por within acima
    minutesUntilStart = startMin > nowMin ? startMin - nowMin : 24 * 60 - nowMin + startMin
  }

  const ms = minutesUntilStart * 60 * 1000
  const nextLabel = formatDailyStartLabel(startH, startM)
  return {
    status: 'waiting',
    label: `Fora do horário — próxima abertura às ${nextLabel} (Brasília)`,
    countdown: formatDurationMs(ms),
    within: false,
    windowLabel: label,
    nextAtLabel: nextLabel,
  }
}

function formatDurationMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/**
 * Calcula fim da janela de hoje (America/Sao_Paulo) como Timestamp.
 * Suporta janela overnight (ex.: 22:00 → 06:00).
 * Fora da janela, retorna null (não inventa sessão de 1 minuto).
 */
export function computeSessionEndsAtFromWindow(cfg = {}, date = new Date()) {
  if (!isWithinProfessorWindow(cfg, date)) return null

  const startH = cfg.windowStartHour ?? cfg.dailyStartHour ?? 0
  const startM = cfg.windowStartMinute ?? cfg.dailyStartMinute ?? 0
  const endH = cfg.windowEndHour ?? ((startH + 8) % 24)
  const endM = cfg.windowEndMinute ?? 0
  const now = getSaoPauloClockParts(date)
  const nowMin = toMinutes(now.hour, now.minute)
  const startMin = toMinutes(startH, startM)
  const endMin = toMinutes(endH, endM)
  const overnight = endMin <= startMin

  let minutesLeft
  if (!overnight) {
    minutesLeft = Math.max(1, endMin - nowMin)
  } else if (nowMin >= startMin) {
    minutesLeft = Math.max(1, 24 * 60 - nowMin + endMin)
  } else {
    minutesLeft = Math.max(1, endMin - nowMin)
  }

  return Timestamp.fromDate(new Date(Date.now() + minutesLeft * 60 * 1000))
}

export function subscribeProfessorSupervisorConfig(onData) {
  if (!db) return () => {}
  const ref = doc(db, ...CONFIG_PATH)
  return onSnapshot(ref, (snap) => {
    onData(snap.exists() ? snap.data() : { enabled: false, recurringDaily: false })
  })
}

/**
 * Ativa/desativa agenda semanal (seg→seg) com janela diária de horário.
 * @param {string} userId
 * @param {boolean} enabled
 * @param {{ startHour?: number, startMinute?: number, endHour?: number, endMinute?: number }} schedule
 */
export async function setProfessorSupervisorEnabled(userId, enabled, schedule = {}) {
  if (!db || !userId) throw new Error('Não autenticado.')
  const ref = doc(db, ...CONFIG_PATH)

  if (enabled) {
    const clock = getSaoPauloClockParts()
    const startHour = schedule.startHour ?? clock.hour
    const startMinute = schedule.startMinute ?? 0
    const endHour = schedule.endHour ?? Math.min(23, startHour + 8)
    const endMinute = schedule.endMinute ?? 0
    const todayKey = getTodayKeyInSaoPaulo()
    const windowCfg = {
      windowStartHour: startHour,
      windowStartMinute: startMinute,
      windowEndHour: endHour,
      windowEndMinute: endMinute,
      dailyStartHour: startHour,
      dailyStartMinute: startMinute,
    }
    const windowLabel = formatScheduleWindowLabel(windowCfg)
    const within = isWithinProfessorWindow(windowCfg)

    // Fora da janela: agenda o dia, sem sessão fantasma de 1 minuto
    if (!within) {
      await setDoc(
        ref,
        {
          enabled: false,
          recurringDaily: true,
          automationUserId: userId,
          ...windowCfg,
          phase: 'waiting_daily',
          sessionEndsAt: null,
          nextRunAt: null,
          currentActivity: {
            phase: 'waiting_daily',
            message: `Agenda ${windowLabel} (seg–dom) — fora do horário agora. Volta às ${formatDailyStartLabel(startHour, startMinute)}.`,
            updatedAt: serverTimestamp(),
          },
          lastMessage: `Agenda ativa ${windowLabel} — aguardando janela`,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      return { scheduled: true, within: false, windowLabel }
    }

    const sessionEndsAt = computeSessionEndsAtFromWindow(windowCfg)

    await setDoc(
      ref,
      {
        enabled: true,
        recurringDaily: true,
        automationUserId: userId,
        ...windowCfg,
        lastAutoStartDate: todayKey,
        sessionStartedAt: serverTimestamp(),
        sessionEndsAt,
        nextRunAt: serverTimestamp(),
        phase: 'starting',
        itemsProcessedSession: 0,
        currentActivity: {
          phase: 'starting',
          message: `Agenda ${windowLabel} (seg–dom) — iniciando…`,
          updatedAt: serverTimestamp(),
        },
        lastMessage: `Agenda ativa ${windowLabel} (segunda a domingo)`,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    return { scheduled: true, within: true, windowLabel }
  }

  await setDoc(
    ref,
    {
      enabled: false,
      recurringDaily: false,
      automationUserId: null,
      phase: 'idle',
      currentActivity: {
        phase: 'idle',
        message: 'Agenda desativada pelo admin',
        updatedAt: serverTimestamp(),
      },
      lastMessage: 'Professor fiscalizador desativado.',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export function subscribePendingSupervisorReviews(onData, { max = 40 } = {}) {
  if (!db) return () => {}
  const q = query(
    collection(db, 'professorSupervisorReviews'),
    where('status', '==', 'pending_admin'),
    orderBy('createdAt', 'desc'),
    limit(max),
  )
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('Erro ao observar revisões do fiscalizador:', err),
  )
}

export async function rollbackSupervisorPatches(courseId, patches = []) {
  if (!db || !courseId || !patches.length) return

  for (const patch of patches) {
    if (patch.materialIndex != null) {
      const ref = doc(db, 'courses', courseId, 'vesperaDeProva', 'material')
      const snap = await getDoc(ref)
      if (!snap.exists()) continue
      const material = [...(snap.data().material || [])]
      const idx = patch.materialIndex
      if (material[idx] && patch.before?.resumo != null) {
        const resumos = [...(material[idx].revisaoTurbo?.resumos || [])]
        if (resumos.length) resumos[0] = patch.before.resumo
        material[idx] = {
          ...material[idx],
          revisaoTurbo: { ...material[idx].revisaoTurbo, resumos },
        }
        await setDoc(ref, { material, updatedAt: serverTimestamp() }, { merge: true })
      }
      continue
    }

    const { collection: coll, docId, before } = patch
    if (!coll || !docId || !before) continue
    await setDoc(
      doc(db, 'courses', courseId, coll, docId),
      { ...before, supervisorReviewed: false, updatedAt: serverTimestamp() },
      { merge: true },
    )
  }
}

export async function resolveSupervisorReview(reviewId, action = 'approved') {
  if (!db || !reviewId) return

  const reviewRef = doc(db, 'professorSupervisorReviews', reviewId)
  const snap = await getDoc(reviewRef)
  if (!snap.exists()) return

  const review = snap.data()
  if (action === 'rejected' && review.patches?.length) {
    await rollbackSupervisorPatches(review.courseId, review.patches)
  }

  await updateDoc(reviewRef, {
    status: action === 'rejected' ? 'rejected' : 'approved',
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function approveAllSupervisorReviews(reviews = []) {
  if (!db || !reviews.length) return { approved: 0 }

  const batch = writeBatch(db)
  let count = 0

  for (const review of reviews) {
    if (review.status !== 'pending_admin') continue
    batch.update(doc(db, 'professorSupervisorReviews', review.id), {
      status: 'approved',
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    count += 1
  }

  if (count > 0) await batch.commit()
  return { approved: count }
}

export async function fetchSupervisorHistory({ max = 30 } = {}) {
  if (!db) return []
  const q = query(
    collection(db, 'professorSupervisorHistory'),
    orderBy('createdAt', 'desc'),
    limit(max),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Apaga todo o histórico do Professor IA (admin). */
export async function clearSupervisorHistory() {
  if (!db) return { deleted: 0 }
  const snap = await getDocs(collection(db, 'professorSupervisorHistory'))
  if (snap.empty) return { deleted: 0 }

  let deleted = 0
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db)
    const chunk = docs.slice(i, i + 400)
    chunk.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    deleted += chunk.length
  }
  return { deleted }
}

/**
 * Limpa a fila do Professor IA (pending/error/processing/cancelled).
 * Use para remover itens legados (tópicos/véspera) anteriores à Moderação-only.
 */
export async function clearSupervisorQueue() {
  if (!db) return { deleted: 0 }
  const snap = await getDocs(collection(db, 'professorSupervisorQueue'))
  if (snap.empty) {
    await setDoc(
      doc(db, ...CONFIG_PATH),
      { queueSize: 0, updatedAt: serverTimestamp() },
      { merge: true },
    )
    return { deleted: 0 }
  }

  let deleted = 0
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db)
    const chunk = docs.slice(i, i + 400)
    chunk.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    deleted += chunk.length
  }

  await setDoc(
    doc(db, ...CONFIG_PATH),
    {
      queueSize: 0,
      currentActivity: {
        phase: 'idle',
        message: 'Fila limpa pelo admin — aguardando novas sinalizações da Moderação',
        updatedAt: serverTimestamp(),
      },
      lastMessage: `Fila limpa (${deleted} item(ns) removido(s))`,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return { deleted }
}

export const SUPERVISOR_PHASE_LABELS = {
  idle: 'Ocioso',
  starting: 'Iniciando…',
  running: 'Fiscalizando agora',
  waiting_next: 'Aguardando próximo item',
  waiting_api: 'Aguardando API',
  waiting_daily: 'Fora do horário / aguardando janela',
  building_queue: 'Montando fila',
  session_expired: 'Janela do dia encerrada',
  completed: 'Fiscalização concluída',
}

export const PROFESSOR_STEP_LABELS = {
  iniciando: 'Preparando',
  digitacao: 'Professor de digitação (script)',
  professor_1: 'Professor 1 — fiscalizando',
  professor_2: 'Professor 2 — revisando',
  professor_3: 'Professor 3 — veredito',
  processando: 'Processando',
}
