import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildNextCardCue,
  buildSessionIntro,
  cancelSpeech,
  getTeacherSettings,
  isSpeechSupported,
  listTeacherVoices,
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
 * Orquestra o Modo Professor (voz gratuita do aparelho).
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
  const [status, setStatus] = useState('idle')
  const [phase, setPhase] = useState('idle')
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
      if (!alive) return
      setVoices(list)
      const cfg = getTeacherSettings()
      const best = pickTeacherVoice(list, cfg.gender, cfg.voiceURI)
      if (best?.voiceURI && best.voiceURI !== cfg.voiceURI) {
        setSettings(saveTeacherSettings({ voiceURI: best.voiceURI }))
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const selectedVoice = pickTeacherVoice(voices, settings.gender, settings.voiceURI)
  const availableVoices = listTeacherVoices(voices, settings.gender)

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
    let next = saveTeacherSettings(partial)
    // Ao trocar gênero, já escolhe a melhor voz masculina/feminina disponível
    if (partial?.gender && voicesRef.current.length) {
      const best = pickTeacherVoice(voicesRef.current, next.gender, next.voiceURI)
      if (best?.voiceURI && best.voiceURI !== next.voiceURI) {
        next = saveTeacherSettings({ voiceURI: best.voiceURI })
      }
    }
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
      const voice = pickTeacherVoice(voiceList, cfg.gender, cfg.voiceURI)
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
        setError('Seu navegador não suporta leitura de áudio gratuita.')
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
        // Título do tópico/artigo: só uma vez no começo da aula
        const firstCard = cardsRef.current[i]
        const materia = deckSubtitle || firstCard?.materia || ''
        const assunto = deckTitle || firstCard?.modulo || ''
        const subjectLine = [materia, assunto].filter(Boolean).join('. ')
        setPhase('intro')
        await speak(
          buildSessionIntro(subjectLine, cardsRef.current.length - startIndex),
          controller.signal
        )

        while (i < cardsRef.current.length) {
          if (controller.signal.aborted || runId !== runIdRef.current) return

          const card = cardsRef.current[i]
          if (!card) break

          const front = card.pergunta || card.frente || ''
          const back = card.resposta || card.verso || ''

          if (flippedRef.current) onFlipChange?.(false)

          // Nos cards seguintes: só o conteúdo (frente → verso), sem repetir o título
          setPhase('front')
          const frontText = [card.textoBase ? `Texto base: ${card.textoBase}` : '', front]
            .filter(Boolean)
            .join('. ')
          await speak(frontText || 'Frente do flashcard.', controller.signal)

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

          onFlipChange?.(false)
          onGoNext?.()
          i += 1
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

  return {
    supported,
    enabled,
    status,
    phase,
    thinkRemaining,
    settings,
    updateSettings,
    selectedVoice,
    availableVoices,
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
