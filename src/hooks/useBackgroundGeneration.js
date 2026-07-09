import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import {
  subscribeActiveGenerationJobs,
  reconcileStaleGenerationJobs,
} from '../services/generationJobService'

/** Observa jobs de geração ativos do usuário (segundo plano). */
export function useBackgroundGeneration() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    if (!user?.uid) {
      setJobs([])
      return () => {}
    }

    reconcileStaleGenerationJobs(user.uid).catch(() => {})

    const interval = setInterval(() => {
      reconcileStaleGenerationJobs(user.uid).catch(() => {})
    }, 5 * 60 * 1000)

    const unsub = subscribeActiveGenerationJobs(user.uid, setJobs)
    return () => {
      clearInterval(interval)
      unsub?.()
    }
  }, [user?.uid])

  return { jobs, hasActiveJobs: jobs.length > 0 }
}
