import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import {
  subscribeActiveGenerationJobs,
  reconcileStaleGenerationJobs,
  nudgeGenerationJobResume,
  kickGenerationJob,
  shouldNudgeJob,
  STALL_NUDGE_MS,
  syncCancellingJobsWithActive,
  isJobNudgePaused,
  GENERATION_JOB_STATUS,
} from '../services/generationJobService'

/** Observa jobs de geração ativos do usuário (segundo plano). */
export function useBackgroundGeneration() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [subscribeError, setSubscribeError] = useState(null)
  const lastNudgeRef = useRef({})
  const lastKickRef = useRef({})
  const failStreakRef = useRef({})

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

  useEffect(() => {
    if (!user?.uid || !jobs.length) return () => {}

    const nudgeEligible = (now) => {
      if (isJobNudgePaused()) return
      jobs.forEach((job) => {
        if (job.status === GENERATION_JOB_STATUS.PENDING) {
          const created = job.createdAt?.toDate?.()
          const ageMs = created ? now - created.getTime() : 0
          if (ageMs >= 8_000) {
            const lastKick = lastKickRef.current[job.id] || 0
            if (now - lastKick >= 20_000) {
              lastKickRef.current[job.id] = now
              kickGenerationJob(user.uid, job.id).catch(() => {})
            }
          }
        }

        if (!shouldNudgeJob(job, now)) return
        const fails = failStreakRef.current[job.id] || 0
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

  return { jobs, hasActiveJobs: jobs.length > 0, subscribeError }
}
