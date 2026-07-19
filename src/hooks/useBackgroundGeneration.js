import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import {
  subscribeActiveGenerationJobs,
  reconcileStaleGenerationJobs,
  syncCancellingJobsWithActive,
} from '../services/generationJobService'

/** Observa jobs de geração ativos do usuário (processados na aba do admin). */
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

    reconcileStaleGenerationJobs(user.uid).catch(() => {})

    const interval = setInterval(() => {
      reconcileStaleGenerationJobs(user.uid).catch(() => {})
    }, 60 * 1000)

    const unsub = subscribeActiveGenerationJobs(
      user.uid,
      (rows) => {
        syncCancellingJobsWithActive(rows.map((job) => job.id))
        setJobs(rows)
        setSubscribeError(null)
      },
      (err) => {
        setSubscribeError(
          err?.message || 'Não foi possível acompanhar as tarefas de geração.',
        )
      },
    )
    return () => {
      clearInterval(interval)
      unsub?.()
    }
  }, [user?.uid])

  return { jobs, hasActiveJobs: jobs.length > 0, subscribeError }
}
