import dayjs from 'dayjs'

/** Intervalos progressivos (minutos) após marcar Fácil consecutivamente */
export const EASY_INTERVALS_MINUTES = [15, 60, 360, 1440, 4320, 10080]

export function isCardDue(progress, now = dayjs()) {
  if (!progress?.nextReview) return true
  const next = dayjs(progress.nextReview)
  return !next.isValid() || next.isBefore(now) || next.isSame(now)
}

export function calculateNextReview(currentProgress, difficulty, now = dayjs()) {
  const reviewCount = (currentProgress?.reviewCount || 0) + 1

  if (difficulty === 'hard') {
    return {
      easeFactor: 2.5,
      intervalMinutes: 1,
      nextReview: now.add(1, 'minute').toISOString(),
      reviewCount,
      consecutiveCorrect: 0,
      lastDifficulty: 'hard',
    }
  }

  const streak = (currentProgress?.consecutiveCorrect || 0) + 1
  const idx = Math.min(streak - 1, EASY_INTERVALS_MINUTES.length - 1)
  const intervalMinutes = EASY_INTERVALS_MINUTES[idx]

  return {
    easeFactor: 2.5,
    intervalMinutes,
    nextReview: now.add(intervalMinutes, 'minute').toISOString(),
    reviewCount,
    consecutiveCorrect: streak,
    lastDifficulty: 'easy',
  }
}

export function formatIntervalMinutes(minutes) {
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) return `${Math.round(minutes / 60)} h`
  return `${Math.round(minutes / 1440)} d`
}

export function getNextReviewLabel(progress) {
  if (!progress?.nextReview) return null
  const next = dayjs(progress.nextReview)
  if (!next.isValid() || isCardDue(progress)) return null
  return next.format('DD/MM HH:mm')
}
