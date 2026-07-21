import { useEffect, useMemo, useState, useCallback } from 'react'
import dayjs from 'dayjs'
import { buildDueQueue, getDeckSRSStats, isCardDue } from '../utils/spacedRepetition'

/**
 * Deck SRS com fila automática de cards vencidos e atualização periódica.
 * Cards marcados como difícil na sessão vão para o FIM da fila (não para o início).
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
    // Difíceis da sessão no fim — não interrompem a fila atual
    const extra = sessionRequeue.filter((c) => c?.id && !baseIds.has(c.id))
    return [...base, ...extra]
  }, [cards, cardProgress, now, includeAll, sessionRequeue])

  const stats = useMemo(
    () => getDeckSRSStats(cards, cardProgress, now),
    [cards, cardProgress, now],
  )

  const bumpNow = useCallback(() => setNow(dayjs()), [])

  const requeueCard = useCallback((card) => {
    if (!card?.id) return
    setSessionRequeue((prev) => {
      const without = prev.filter((c) => c.id !== card.id)
      return [...without, card]
    })
  }, [])

  const removeFromRequeue = useCallback((cardId) => {
    if (!cardId) return
    setSessionRequeue((prev) => prev.filter((c) => c.id !== cardId))
  }, [])

  const clearRequeue = useCallback(() => setSessionRequeue([]), [])

  return {
    now,
    bumpNow,
    dueQueue,
    stats,
    requeueCard,
    removeFromRequeue,
    clearRequeue,
    isCardDue: (cardId) => isCardDue(cardProgress[cardId], now),
  }
}
