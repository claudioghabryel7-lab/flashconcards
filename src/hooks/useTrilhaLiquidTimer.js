import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildTimerState,
  clearTrilhaTimer,
  computeElapsedSeconds,
  loadTrilhaTimer,
  pauseTimerState,
  persistTrilhaTimer,
  resumeTimerState,
} from '../utils/trilhaTimerPersistence'

const DEFAULT_FORM = { materia: '', assunto: '', modalidade: 'teoria' }

export function useTrilhaLiquidTimer(userId, courseId, { onAlarm } = {}) {
  const [timerState, setTimerState] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [timerForm, setTimerFormState] = useState(DEFAULT_FORM)
  const [alarmMinutes, setAlarmMinutesState] = useState(50)
  const loadedRef = useRef(false)
  const alarmPlayedRef = useRef(false)

  const timerActive = !!timerState?.active
  const timerPaused = !!timerState?.paused
  const alarmTriggered = !!timerState?.alarmTriggered

  const commitState = useCallback(
    (next) => {
      setTimerState(next)
      if (!userId) return next
      if (next?.active) persistTrilhaTimer(userId, next)
      else clearTrilhaTimer(userId)
      return next
    },
    [userId],
  )

  useEffect(() => {
    if (!userId) {
      setTimerState(null)
      setElapsedSeconds(0)
      loadedRef.current = false
      return
    }

    const saved = loadTrilhaTimer(userId)
    if (saved) {
      setTimerState(saved)
      setTimerFormState(saved.timerForm || DEFAULT_FORM)
      setAlarmMinutesState(saved.alarmMinutes ?? 50)
      setElapsedSeconds(computeElapsedSeconds(saved))
      alarmPlayedRef.current = !!saved.alarmTriggered
    } else {
      alarmPlayedRef.current = false
    }
    loadedRef.current = true
  }, [userId])

  useEffect(() => {
    if (!timerState?.active) {
      if (!timerState) setElapsedSeconds(0)
      return undefined
    }

    const tick = () => setElapsedSeconds(computeElapsedSeconds(timerState))
    tick()
    const id = setInterval(tick, 1000)
    const onVisible = () => tick()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [timerState])

  useEffect(() => {
    if (!userId || !loadedRef.current) return
    if (timerState?.active) persistTrilhaTimer(userId, timerState)
    else clearTrilhaTimer(userId)
  }, [timerState, userId])

  useEffect(() => {
    if (!timerState?.active || !timerState.alarmMinutes || alarmPlayedRef.current) return
    if (elapsedSeconds < timerState.alarmMinutes * 60) return

    alarmPlayedRef.current = true
    const next = { ...timerState, alarmTriggered: true }
    setTimerState(next)
    if (userId) persistTrilhaTimer(userId, next)
    onAlarm?.()
  }, [elapsedSeconds, timerState, onAlarm, userId])

  const setTimerForm = useCallback(
    (updater) => {
      setTimerFormState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        setTimerState((current) => {
          if (!current?.active) return current
          const updated = { ...current, timerForm: next }
          if (userId) persistTrilhaTimer(userId, updated)
          return updated
        })
        return next
      })
    },
    [userId],
  )

  const setAlarmMinutes = useCallback(
    (value) => {
      const nextMinutes = Number(value) || 0
      setAlarmMinutesState(nextMinutes)
      setTimerState((current) => {
        if (!current?.active) return current
        const updated = { ...current, alarmMinutes: nextMinutes }
        if (userId) persistTrilhaTimer(userId, updated)
        return updated
      })
    },
    [userId],
  )

  const handleStart = useCallback(() => {
    alarmPlayedRef.current = false
    const next = buildTimerState({
      userId,
      courseId,
      timerForm,
      alarmMinutes,
      alarmTriggered: false,
    })
    commitState(next)
    setElapsedSeconds(0)
  }, [userId, courseId, timerForm, alarmMinutes, commitState])

  const handlePause = useCallback(() => {
    if (!timerState?.active) return
    const next = timerState.paused ? resumeTimerState(timerState) : pauseTimerState(timerState)
    commitState(next)
    setElapsedSeconds(computeElapsedSeconds(next))
  }, [timerState, commitState])

  const clearTimer = useCallback(() => {
    alarmPlayedRef.current = false
    commitState(null)
    setElapsedSeconds(0)
  }, [commitState])

  return {
    timerActive,
    timerPaused,
    elapsedSeconds,
    alarmMinutes,
    alarmTriggered,
    timerForm,
    timerState,
    setTimerForm,
    setAlarmMinutes,
    handleStart,
    handlePause,
    clearTimer,
  }
}
