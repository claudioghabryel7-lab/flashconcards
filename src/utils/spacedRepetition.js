import dayjs from 'dayjs'

/** Intervalos progressivos (minutos) após marcar Fácil consecutivamente */
export const EASY_INTERVALS_MINUTES = [15, 60, 360, 1440, 4320, 10080, 20160]

/** Normaliza nextReview vindo do Firestore (ISO string, Date ou Timestamp). */
export function parseReviewDate(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') {
    const d = dayjs(value.toDate())
    return d.isValid() ? d : null
  }
  if (typeof value?.seconds === 'number') {
    const d = dayjs(value.seconds * 1000)
    return d.isValid() ? d : null
  }
  const d = dayjs(value)
  return d.isValid() ? d : null
}

export function isCardDue(progress, now = dayjs()) {
  if (!progress?.nextReview) return true
  const next = parseReviewDate(progress.nextReview)
  if (!next) return true
  return !next.isAfter(now)
}

export function calculateNextReview(currentProgress, difficulty, now = dayjs()) {
  const reviewCount = (currentProgress?.reviewCount || 0) + 1

  if (difficulty === 'hard') {
    return {
      easeFactor: Math.max(1.3, (currentProgress?.easeFactor || 2.5) - 0.15),
      intervalMinutes: 1,
      nextReview: now.add(1, 'minute').toISOString(),
      reviewCount,
      consecutiveCorrect: 0,
      lastDifficulty: 'hard',
      stage: currentProgress?.stage || 0,
    }
  }

  const streak = (currentProgress?.consecutiveCorrect || 0) + 1
  const idx = Math.min(streak - 1, EASY_INTERVALS_MINUTES.length - 1)
  // Ajusta intervalo pelo ease factor (Anki-like leve), sem sair da faixa útil
  const base = EASY_INTERVALS_MINUTES[idx]
  const ef = Math.min(3, Math.max(1.3, (currentProgress?.easeFactor || 2.5) + 0.05))
  const intervalMinutes = Math.max(1, Math.round(base * (ef / 2.5)))

  return {
    easeFactor: ef,
    intervalMinutes,
    nextReview: now.add(intervalMinutes, 'minute').toISOString(),
    reviewCount,
    consecutiveCorrect: streak,
    lastDifficulty: 'easy',
    stage: Math.min((currentProgress?.stage || 0) + 1, EASY_INTERVALS_MINUTES.length - 1),
  }
}

export function formatIntervalMinutes(minutes) {
  const m = Number(minutes) || 0
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.round(m / 60)} h`
  return `${Math.round(m / 1440)} d`
}

export function getNextReviewLabel(progress, now = dayjs()) {
  if (!progress?.nextReview) return null
  const next = parseReviewDate(progress.nextReview)
  if (!next || isCardDue(progress, now)) return null
  return next.format('DD/MM HH:mm')
}

/** Rótulo do botão SRS — retorna só o intervalo (ex.: "1 min", "15 min"). */
export function getRatingButtonLabel(difficulty, currentProgress, now = dayjs()) {
  const next = calculateNextReview(currentProgress || {}, difficulty, now)
  return formatIntervalMinutes(next.intervalMinutes)
}

function overdueMinutes(progress, now) {
  if (!progress?.nextReview) return 99999
  const next = parseReviewDate(progress.nextReview)
  if (!next || next.isAfter(now)) return 0
  return now.diff(next, 'minute')
}

/** Fila inteligente: novos → mais atrasados → restantes */
export function buildDueQueue(cards = [], cardProgress = {}, now = dayjs()) {
  return cards
    .filter((card) => isCardDue(cardProgress[card.id], now))
    .sort((a, b) => {
      const pa = cardProgress[a.id]
      const pb = cardProgress[b.id]
      const aNew = !pa?.reviewCount
      const bNew = !pb?.reviewCount
      if (aNew && !bNew) return -1
      if (!aNew && bNew) return 1
      return overdueMinutes(pb, now) - overdueMinutes(pa, now)
    })
}

/**
 * Monta a fila de estudo: due (ordenados) + cards difíceis da sessão no fim.
 * sessionHardIds: ids marcados como difícil nesta sessão (ficam no fim até fácil ou fim da sessão).
 */
export function buildStudyQueue(cards = [], cardProgress = {}, sessionHardIds = [], now = dayjs()) {
  const due = buildDueQueue(cards, cardProgress, now)
  const dueIds = new Set(due.map((c) => c.id))
  const byId = new Map(cards.map((c) => [c.id, c]))
  const hardExtra = sessionHardIds
    .map((id) => byId.get(id))
    .filter((c) => c && !dueIds.has(c.id))
  return [...due, ...hardExtra]
}

/** Após avaliar: índice estável — o próximo card "escorrega" para o mesmo índice. */
export function nextIndexAfterRating(currentIndex, queueLengthAfter) {
  if (queueLengthAfter <= 0) return 0
  return currentIndex >= queueLengthAfter ? 0 : currentIndex
}

export function getDeckSRSStats(cards = [], cardProgress = {}, now = dayjs()) {
  const total = cards.length
  const due = buildDueQueue(cards, cardProgress, now).length
  const reviewed = cards.filter((c) => (cardProgress[c.id]?.reviewCount || 0) > 0).length
  const nextDue = cards
    .map((c) => parseReviewDate(cardProgress[c.id]?.nextReview))
    .filter(Boolean)
    .filter((d) => d.isAfter(now))
    .sort((a, b) => a.diff(b))[0]

  const mastered = cards.filter((c) => (cardProgress[c.id]?.stage || 0) >= 4).length
  return { total, due, reviewed, nextDue, mastered }
}

/**
 * Persiste UMA revisão sem sobrescrever o mapa inteiro de cardProgress
 * (evita corrida entre abas / snapshot atrasado apagar progresso).
 */
export async function persistCardReview(userId, cardId, cardProgress, difficulty, courseId = null) {
  const { doc, setDoc } = await import('firebase/firestore')
  const { db } = await import('../firebase/config')

  const now = dayjs()
  const current = cardProgress?.[cardId] || {}
  const next = {
    ...current,
    ...calculateNextReview(current, difficulty, now),
    lastReviewed: now.toISOString(),
  }

  const updated = { ...(cardProgress || {}), [cardId]: next }
  await setDoc(
    doc(db, 'userProgress', userId),
    {
      [`cardProgress.${cardId}`]: next,
      updatedAt: now.toISOString(),
      ...(courseId ? { courseId } : {}),
    },
    { merge: true },
  )

  return { updated, next }
}
