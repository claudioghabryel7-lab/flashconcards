import { useEffect, useState } from 'react'
import { getSimulatedOnlineCount, SIMULATED_ONLINE_TICK_MS } from '../utils/onlineNow'

export function useSimulatedOnlineCount({ courseId = null, platformWide = true } = {}) {
  const [count, setCount] = useState(() =>
    getSimulatedOnlineCount(Date.now(), { courseId, platformWide }),
  )

  useEffect(() => {
    const refresh = () =>
      setCount(getSimulatedOnlineCount(Date.now(), { courseId, platformWide }))

    refresh()
    const id = setInterval(refresh, SIMULATED_ONLINE_TICK_MS)
    return () => clearInterval(id)
  }, [courseId, platformWide])

  return count
}
