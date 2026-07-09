import { useCallback, useState } from 'react'
import {
  loadFloatingCommentsEnabled,
  saveFloatingCommentsEnabled,
} from '../utils/floatingCommentsPrefs'

export function useFloatingCommentsEnabled() {
  const [enabled, setEnabled] = useState(() =>
    typeof window !== 'undefined' ? loadFloatingCommentsEnabled() : false,
  )

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      saveFloatingCommentsEnabled(next)
      return next
    })
  }, [])

  return { enabled, toggle }
}
