import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import {
  subscribeActiveGenerationJobs,
  reconcileStaleGenerationJobs,
  nudgeGenerationJobResume,
  shouldNudgeJob,
  STALL_NUDGE_MS,
  syncCancellingJobsWithActive,
  isJobNudgePaused,
} from '../services/generationJobService'

/** Observa jobs de geração ativos do usuário (segundo plano). */
export function useBackgroundGeneration() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const lastNudgeRef = useRef({})
  const failStreakRef = useRef({})

  useEffect(() => {
    if (!user?.uid) {
      setJobs([])
      return () => {}
    }

    reconcileStaleGenerationJobs(user.uid).catch(() => {})

    const interval = setInterval(() => {
      reconcileStaleGenerationJobs(user.uid).catch(() => {})
    }, 60 * 1000)

    const unsub = subscribeActiveGenerationJobs(user.uid, (rows) => {
      syncCancellingJobsWithActive(rows.map((job) => job.id))
      setJobs(rows)
    })
    return () => {
      clearInterval(interval)
      unsub?.()
    }
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid || !jobs.length) return () => {}

    const nudgeEligible = (now) => {
      if (isJobNudgePaused()) return
      jobs.forEach((job) => {
        if (!shouldNudgeJob(job, now)) return
        const fails = failStreakRef.current[job.id] || 0
        // Backoff: 5s, 15s, 30s, 60s após falhas (evita spam 500/CORS)
        const delay = Math.min(60_000, STALL_NUDGE_MS * Math.pow(2, Math.min(fails, 4)))
        const last = lastNudgeRef.current[job.id] || 0
        if (now - last < delay) return
        lastNudgeRef.current[job.id] = now
        nudgeGenerationJobResume(user.uid, job.id)
          .then((result) => {
            if (result?.ok === false) {
              failStreakRef.current[job.id] = fails + 1
            } else {
              failStreakRef.current[job.id] = 0
            }
          })
          .catch(() => {
            failStreakRef.current[job.id] = fails + 1
          })
      })
    }

    nudgeEligible(Date.now())

    const nudgeInterval = setInterval(() => nudgeEligible(Date.now()), STALL_NUDGE_MS)

    return () => clearInterval(nudgeInterval)
  }, [user?.uid, jobs])

  return { jobs, hasActiveJobs: jobs.length > 0 }
}
