import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { subscribeActiveGenerationJobs } from '../services/generationJobService'

/** Observa jobs de geração ativos do usuário (segundo plano). */
export function useBackgroundGeneration() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    if (!user?.uid) {
      setJobs([])
      return () => {}
    }

    return subscribeActiveGenerationJobs(user.uid, setJobs)
  }, [user?.uid])

  return { jobs, hasActiveJobs: jobs.length > 0, subscribeError: null }
}
