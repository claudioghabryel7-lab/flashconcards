import dayjs from 'dayjs'

/** Intervalos progressivos (minutos) após marcar Fácil consecutivamente */
export const EASY_INTERVALS_MINUTES = [15, 60, 360, 1440, 4320, 10080, 20160]

export function isCardDue(progress, now = dayjs()) {
  if (!progress?.nextReview) return true
  const next = dayjs(progress.nextReview)
  return !next.isValid() || next.isBefore(now) || next.isSame(now)
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
  const intervalMinutes = EASY_INTERVALS_MINUTES[idx]

  return {
    easeFactor: Math.min(3, (currentProgress?.easeFactor || 2.5) + 0.05),
    intervalMinutes,
    nextReview: now.add(intervalMinutes, 'minute').toISOString(),
    reviewCount,
    consecutiveCorrect: streak,
    lastDifficulty: 'easy',
    stage: Math.min((currentProgress?.stage || 0) + 1, EASY_INTERVALS_MINUTES.length - 1),
  }
}

export function formatIntervalMinutes(minutes) {
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) return `${Math.round(minutes / 60)} h`
  return `${Math.round(minutes / 1440)} d`
}

export function getNextReviewLabel(progress, now = dayjs()) {
  if (!progress?.nextReview) return null
  const next = dayjs(progress.nextReview)
  if (!next.isValid() || isCardDue(progress, now)) return null
  return next.format('DD/MM HH:mm')
}

/** Rótulo do botão SRS (ex.: "Repetir em 1 min", "Próximo: 6 h") */
export function getRatingButtonLabel(difficulty, currentProgress, now = dayjs()) {
  const next = calculateNextReview(currentProgress || {}, difficulty, now)
  return formatIntervalMinutes(next.intervalMinutes)
}

function overdueMinutes(progress, now) {
  if (!progress?.nextReview) return 99999
  const next = dayjs(progress.nextReview)
  if (!next.isValid() || next.isAfter(now)) return 0
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

export function getDeckSRSStats(cards = [], cardProgress = {}, now = dayjs()) {
  const total = cards.length
  const due = buildDueQueue(cards, cardProgress, now).length
  const reviewed = cards.filter((c) => (cardProgress[c.id]?.reviewCount || 0) > 0).length
  const nextDue = cards
    .map((c) => cardProgress[c.id]?.nextReview)
    .filter(Boolean)
    .map((d) => dayjs(d))
    .filter((d) => d.isValid() && d.isAfter(now))
    .sort((a, b) => a.diff(b))[0]

  return { total, due, reviewed, nextDue, mastered: total - due - (total - reviewed) }
}

export async function persistCardReview(userId, cardId, cardProgress, difficulty, courseId = null) {
  const { doc, setDoc } = await import('firebase/firestore')
  const { db } = await import('../firebase/config')

  const now = dayjs()
  const current = cardProgress[cardId] || {}
  const next = {
    ...current,
    ...calculateNextReview(current, difficulty, now),
    lastReviewed: now.toISOString(),
  }

  const updated = { ...cardProgress, [cardId]: next }
  await setDoc(
    doc(db, 'userProgress', userId),
    {
      cardProgress: updated,
      updatedAt: now.toISOString(),
      ...(courseId ? { courseId } : {}),
    },
    { merge: true },
  )

  return { updated, next }
}
