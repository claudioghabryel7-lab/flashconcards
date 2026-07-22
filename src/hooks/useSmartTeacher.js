import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildFlashcardIntro,
  buildNextCardCue,
  cancelSpeech,
  getTeacherSettings,
  isSpeechSupported,
  pauseSpeech,
  pickTeacherVoice,
  playTickSound,
  prepareSpeechText,
  resumeSpeech,
  runThinkCountdown,
  saveTeacherSettings,
  speakText,
  waitForVoices,
} from '../services/teacherSpeechService'

/**
 * Orquestra o Modo Professor nos flashcards:
 * intro → lê frente → ticks/think time → vira → lê verso → próximo.
 */
export function useSmartTeacher({
  cards = [],
  currentIndex = 0,
  flipped = false,
  onFlipChange,
  onGoNext,
  deckSubtitle = '',
  deckTitle = '',
}) {
  const [supported] = useState(() => isSpeechSupported())
  const [voices, setVoices] = useState([])
  const [settings, setSettings] = useState(() => getTeacherSettings())
  const [status, setStatus] = useState('idle') // idle | playing | paused | thinking
  const [phase, setPhase] = useState('idle') // intro | front | thinking | back | next | done
  const [thinkRemaining, setThinkRemaining] = useState(0)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const pausedRef = useRef(false)
  const runIdRef = useRef(0)
  const playingRef = useRef(false)
  const cardsRef = useRef(cards)
  const indexRef = useRef(currentIndex)
  const flippedRef = useRef(flipped)
  const settingsRef = useRef(settings)
  const voicesRef = useRef([])

  useEffect(() => {
    cardsRef.current = cards
  }, [cards])
  useEffect(() => {
    indexRef.current = currentIndex
  }, [currentIndex])
  useEffect(() => {
    flippedRef.current = flipped
  }, [flipped])
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => {
    voicesRef.current = voices
  }, [voices])

  useEffect(() => {
    let alive = true
    waitForVoices().then((list) => {
      if (alive) setVoices(list)
    })
    return () => {
      alive = false
    }
  }, [])

  const selectedVoice = pickTeacherVoice(voices, settings.gender)

  const stopAll = useCallback(() => {
    runIdRef.current += 1
    playingRef.current = false
    pausedRef.current = false
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    cancelSpeech()
    setStatus('idle')
    setPhase('idle')
    setThinkRemaining(0)
  }, [])

  useEffect(() => () => stopAll(), [stopAll])

  const updateSettings = useCallback((partial) => {
    const next = saveTeacherSettings(partial)
    setSettings(next)
    return next
  }, [])

  const waitIfPaused = useCallback(async (signal) => {
    while (pausedRef.current) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      await new Promise((r) => setTimeout(r, 120))
    }
  }, [])

  const speak = useCallback(
    async (text, signal) => {
      const clean = prepareSpeechText(text)
      if (!clean) return
      await waitIfPaused(signal)
      const cfg = settingsRef.current
      let voiceList = voicesRef.current
      if (!voiceList?.length) {
        voiceList = await waitForVoices()
        voicesRef.current = voiceList
        setVoices(voiceList)
      }
      const voice = pickTeacherVoice(voiceList, cfg.gender)
      await speakText(clean, {
        voice,
        gender: cfg.gender,
        rate: cfg.speechRate,
        signal,
      })
      await waitIfPaused(signal)
    },
    [waitIfPaused]
  )

  const runSessionFrom = useCallback(
    async (startIndex) => {
      if (!supported) {
        setError('Seu navegador não suporta leitura de áudio local.')
        return
      }

      stopAll()
      const runId = runIdRef.current + 1
      runIdRef.current = runId
      const controller = new AbortController()
      abortRef.current = controller
      playingRef.current = true
      pausedRef.current = false
      setEnabled(true)
      setError(null)
      setStatus('playing')

      try {
        let i = startIndex
        while (i < cardsRef.current.length) {
          if (controller.signal.aborted || runId !== runIdRef.current) return

          const card = cardsRef.current[i]
          if (!card) break

          // Garante card atual alinhado
          if (indexRef.current !== i) {
            // navegação externa via onGoNext/onSelect — o pai controla índice
          }

          const front = card.pergunta || card.frente || ''
          const back = card.resposta || card.verso || ''
          const materia = deckSubtitle || card.materia || ''
          const assunto = deckTitle || card.modulo || ''
          const subjectLine = [materia, assunto].filter(Boolean).join('. ')

          // Frente
          if (flippedRef.current) onFlipChange?.(false)
          setPhase('intro')
          await speak(
            buildFlashcardIntro(i, cardsRef.current.length, subjectLine),
            controller.signal
          )

          setPhase('front')
          const frontText = [card.textoBase ? `Texto base: ${card.textoBase}` : '', front]
            .filter(Boolean)
            .join('. ')
          await speak(frontText || 'Frente do flashcard.', controller.signal)

          // Tempo para pensar + ticks
          setPhase('thinking')
          setStatus('thinking')
          setThinkRemaining(settingsRef.current.thinkSeconds)
          await runThinkCountdown(settingsRef.current.thinkSeconds, {
            signal: controller.signal,
            shouldPause: () => pausedRef.current,
            onTick: (remaining) => {
              if (runId !== runIdRef.current) return
              setThinkRemaining(remaining)
            },
          })

          // Vira e lê verso
          onFlipChange?.(true)
          setPhase('back')
          setStatus('playing')
          await speak(back || 'Verso do flashcard.', controller.signal)

          const isLast = i >= cardsRef.current.length - 1
          setPhase('next')
          await speak(buildNextCardCue(isLast), controller.signal)

          if (isLast) {
            setPhase('done')
            setStatus('idle')
            playingRef.current = false
            return
          }

          if (!settingsRef.current.autoAdvance) {
            setStatus('paused')
            pausedRef.current = true
            await waitIfPaused(controller.signal)
            pausedRef.current = false
            setStatus('playing')
          }

          // Vira para a frente antes de trocar o card (evita flash do verso)
          onFlipChange?.(false)
          onGoNext?.()
          i += 1
          // Pequena pausa para o React aplicar o novo índice/card
          await new Promise((r) => setTimeout(r, 350))
        }
      } catch (err) {
        if (err?.name === 'AbortError') return
        console.error('[SmartTeacher]', err)
        setError(err?.message || 'Falha na leitura do professor')
        setStatus('idle')
        setPhase('idle')
        playingRef.current = false
      }
    },
    [supported, stopAll, speak, onFlipChange, onGoNext, deckSubtitle, deckTitle, waitIfPaused]
  )

  const play = useCallback(() => {
    if (status === 'paused' && playingRef.current) {
      pausedRef.current = false
      resumeSpeech()
      setStatus(phase === 'thinking' ? 'thinking' : 'playing')
      return
    }
    runSessionFrom(currentIndex)
  }, [status, phase, runSessionFrom, currentIndex])

  const pause = useCallback(() => {
    if (!playingRef.current) return
    pausedRef.current = true
    pauseSpeech()
    setStatus('paused')
  }, [])

  const toggle = useCallback(() => {
    if (status === 'playing' || status === 'thinking') pause()
    else play()
  }, [status, pause, play])

  const stop = useCallback(() => {
    stopAll()
    setEnabled(false)
  }, [stopAll])

  // Se o usuário navegar manualmente durante a sessão, interrompe para evitar desalinhamento
  useEffect(() => {
    if (!playingRef.current) return
    // Não cancela no avanço automático do próprio professor (phase next → index change)
    if (phase === 'next' || phase === 'done') return
    // Se mudou índice sem estar na fase de transição, para
  }, [currentIndex, phase])

  return {
    supported,
    enabled,
    status,
    phase,
    thinkRemaining,
    settings,
    updateSettings,
    selectedVoice,
    voices,
    error,
    play,
    pause,
    toggle,
    stop,
    playTickPreview: () => playTickSound({ final: false }),
  }
}

export default useSmartTeacher
