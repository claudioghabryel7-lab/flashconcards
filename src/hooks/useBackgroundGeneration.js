import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { subscribeActiveGenerationJobs } from '../services/generationJobService'

/** Observa jobs de geração ativos do usuário (segundo plano). */
export function useBackgroundGeneration() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [subscribeError, setSubscribeError] = useState(null)

  useEffect(() => {
    if (!user?.uid) {
      setJobs([])
      setSubscribeError(null)
      return () => {}
    }

    return subscribeActiveGenerationJobs(
      user.uid,
      (rows) => {
        setJobs(rows)
        setSubscribeError(null)
      },
      (err) => {
        setSubscribeError(err?.message || 'Falha ao observar status da geração.')
      },
    )
  }, [user?.uid])

  return { jobs, hasActiveJobs: jobs.length > 0, subscribeError }
}
