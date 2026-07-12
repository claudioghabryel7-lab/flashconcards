import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import {
  subscribeActiveGenerationJobs,
  reconcileStaleGenerationJobs,
  nudgeGenerationJobResume,
  shouldNudgeJob,
  STALL_NUDGE_MS,
} from '../services/generationJobService'

/** Observa jobs de geração ativos do usuário (segundo plano). */
export function useBackgroundGeneration() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const lastNudgeRef = useRef({})

  useEffect(() => {
    if (!user?.uid) {
      setJobs([])
      return () => {}
    }

    reconcileStaleGenerationJobs(user.uid).catch(() => {})

    const interval = setInterval(() => {
      reconcileStaleGenerationJobs(user.uid).catch(() => {})
    }, STALL_NUDGE_MS)

    const unsub = subscribeActiveGenerationJobs(user.uid, setJobs)
    return () => {
      clearInterval(interval)
      unsub?.()
    }
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid || !jobs.length) return () => {}

    const nudgeEligible = (now) => {
      jobs.forEach((job) => {
        if (!shouldNudgeJob(job, now)) return
        const last = lastNudgeRef.current[job.id] || 0
        if (now - last < STALL_NUDGE_MS) return
        lastNudgeRef.current[job.id] = now
        nudgeGenerationJobResume(user.uid, job.id).catch((err) => {
          console.warn('[nudgeGenerationJobResume]', job.id, err?.message || err)
        })
      })
    }

    nudgeEligible(Date.now())

    const nudgeInterval = setInterval(() => nudgeEligible(Date.now()), STALL_NUDGE_MS)

    return () => clearInterval(nudgeInterval)
  }, [user?.uid, jobs])

  return { jobs, hasActiveJobs: jobs.length > 0 }
}
