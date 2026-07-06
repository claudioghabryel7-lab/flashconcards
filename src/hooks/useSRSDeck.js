import { useEffect, useMemo, useState, useCallback } from 'react'
import dayjs from 'dayjs'
import { buildDueQueue, getDeckSRSStats, isCardDue } from '../utils/spacedRepetition'

/**
 * Deck SRS com fila automática de cards vencidos e atualização periódica.
 */
export function useSRSDeck(cards = [], cardProgress = {}, { refreshMs = 15000, includeAll = false } = {}) {
  const [now, setNow] = useState(() => dayjs())
  const [sessionRequeue, setSessionRequeue] = useState([])

  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), refreshMs)
    return () => clearInterval(id)
  }, [refreshMs])

  const dueQueue = useMemo(() => {
    if (includeAll) return [...cards]
    const base = buildDueQueue(cards, cardProgress, now)
    const baseIds = new Set(base.map((c) => c.id))
    const extra = sessionRequeue.filter((c) => !baseIds.has(c.id))
    return [...extra, ...base]
  }, [cards, cardProgress, now, includeAll, sessionRequeue])

  const stats = useMemo(
    () => getDeckSRSStats(cards, cardProgress, now),
    [cards, cardProgress, now],
  )

  const bumpNow = useCallback(() => setNow(dayjs()), [])

  const requeueCard = useCallback((card) => {
    if (!card?.id) return
    setSessionRequeue((prev) => {
      if (prev.some((c) => c.id === card.id)) return prev
      return [card, ...prev]
    })
  }, [])

  const clearRequeue = useCallback(() => setSessionRequeue([]), [])

  return {
    now,
    bumpNow,
    dueQueue,
    stats,
    requeueCard,
    clearRequeue,
    isCardDue: (cardId) => isCardDue(cardProgress[cardId], now),
  }
}
