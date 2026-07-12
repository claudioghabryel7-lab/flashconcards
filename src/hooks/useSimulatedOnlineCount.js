import { useEffect, useState } from 'react'
import {
  getSimulatedOnlineCount,
  SIMULATED_ONLINE_STEP_MS,
} from '../utils/onlineNow'

export function useSimulatedOnlineCount({ courseId = null, platformWide = true } = {}) {
  const [count, setCount] = useState(() =>
    getSimulatedOnlineCount(Date.now(), { courseId, platformWide }),
  )

  useEffect(() => {
    const refresh = () =>
      setCount(getSimulatedOnlineCount(Date.now(), { courseId, platformWide }))

    refresh()
    const id = setInterval(refresh, SIMULATED_ONLINE_STEP_MS)

    const onStorage = (e) => {
      if (e.key === 'cp_simulated_online_v2') refresh()
    }
    window.addEventListener('storage', onStorage)

    return () => {
      clearInterval(id)
      window.removeEventListener('storage', onStorage)
    }
  }, [courseId, platformWide])

  return count
}
