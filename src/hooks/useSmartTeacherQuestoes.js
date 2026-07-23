import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cancelSpeech,
  getTeacherSettings,
  isSpeechSupported,
  listTeacherVoices,
  pauseSpeech,
  pickTeacherVoice,
  prepareSpeechText,
  resumeSpeech,
  saveTeacherSettings,
  speakText,
  waitForVoices,
} from '../services/teacherSpeechService'
import { mapOrderedAlternativas } from '../utils/questaoAlternativas'
import {
  resolveQuestaoExplicacao,
  resolveQuestaoGabarito,
} from '../components/QuestoesPraticaCP'

/**
 * Modo Professor para questões:
 * enunciado → alternativas → “qual a correta?” → (espera clique) → certo/errado + explicação → próxima
 */
export function useSmartTeacherQuestoes({
  questoes = [],
  currentIndex = 0,
  tipoProva = '',
  selectedAnswer = null,
  showResult = false,
  onGoNext,
  deckTitle = '',
}) {
  const [supported] = useState(() => isSpeechSupported())
  const [voices, setVoices] = useState([])
  const [settings, setSettings] = useState(() => getTeacherSettings())
  const [status, setStatus] = useState('idle')
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const pausedRef = useRef(false)
  const runIdRef = useRef(0)
  const playingRef = useRef(false)
  const awaitingAnswerRef = useRef(false)
  const answerResolverRef = useRef(null)
  const questoesRef = useRef(questoes)
  const indexRef = useRef(currentIndex)
  const settingsRef = useRef(settings)
  const voicesRef = useRef([])
  const showResultRef = useRef(showResult)
  const selectedAnswerRef = useRef(selectedAnswer)

  useEffect(() => {
    questoesRef.current = questoes
  }, [questoes])
  useEffect(() => {
    indexRef.current = currentIndex
  }, [currentIndex])
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => {
    voicesRef.current = voices
  }, [voices])
  useEffect(() => {
    showResultRef.current = showResult
    selectedAnswerRef.current = selectedAnswer
    if (awaitingAnswerRef.current && showResult && answerResolverRef.current) {
      const resolve = answerResolverRef.current
      answerResolverRef.current = null
      awaitingAnswerRef.current = false
      resolve({
        selected: selectedAnswer,
      })
    }
  }, [showResult, selectedAnswer])

  useEffect(() => {
    let alive = true
    waitForVoices().then((list) => {
      if (!alive) return
      setVoices(list)
      const cfg = getTeacherSettings()
      const best = pickTeacherVoice(list, 'female', cfg.voiceURI)
      if (best?.voiceURI && best.voiceURI !== cfg.voiceURI) {
        setSettings(saveTeacherSettings({ voiceURI: best.voiceURI }))
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const selectedVoice = pickTeacherVoice(voices, 'female', settings.voiceURI)
  const availableVoices = listTeacherVoices(voices, 'female')

  const stopAll = useCallback(() => {
    runIdRef.current += 1
    playingRef.current = false
    pausedRef.current = false
    awaitingAnswerRef.current = false
    if (answerResolverRef.current) {
      answerResolverRef.current = null
    }
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    cancelSpeech()
    setStatus('idle')
    setPhase('idle')
  }, [])

  useEffect(() => () => stopAll(), [stopAll])

  const updateSettings = useCallback((partial) => {
    const next = saveTeacherSettings({ ...partial, gender: 'female' })
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
      const voice = pickTeacherVoice(voiceList, 'female', cfg.voiceURI)
      await speakText(clean, {
        voice,
        gender: 'female',
        rate: cfg.speechRate,
        signal,
        shouldPause: () => pausedRef.current,
      })
      await waitIfPaused(signal)
    },
    [waitIfPaused]
  )

  const waitForUserAnswer = useCallback((signal) => {
    if (showResultRef.current) {
      return Promise.resolve({ selected: selectedAnswerRef.current })
    }
    return new Promise((resolve, reject) => {
      awaitingAnswerRef.current = true
      answerResolverRef.current = resolve
      const onAbort = () => {
        awaitingAnswerRef.current = false
        answerResolverRef.current = null
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }, [])

  const runSessionFrom = useCallback(
    async (startIndex) => {
      if (!supported) {
        setError('Leitura de áudio não suportada neste navegador.')
        return
      }

      stopAll()
      const runId = runIdRef.current + 1
      runIdRef.current = runId
      const controller = new AbortController()
      abortRef.current = controller
      playingRef.current = true
      pausedRef.current = false
      setError(null)
      setStatus('playing')

      try {
        if (deckTitle) {
          setPhase('intro')
          await speak(`Vamos resolver as questões de ${deckTitle}.`, controller.signal)
        }

        let i = startIndex
        while (i < questoesRef.current.length) {
          if (controller.signal.aborted || runId !== runIdRef.current) return

          const item = questoesRef.current[i]
          const questao = item?.questao || item
          if (!questao) break

          const tipo = item?.tipoProva || tipoProva || ''
          const isCE = String(tipo).toLowerCase().includes('certo')
          const gabarito = String(resolveQuestaoGabarito(questao) || '').toUpperCase()
          const explicacao = resolveQuestaoExplicacao(questao)
          const alts = mapOrderedAlternativas(questao?.alternativas)

          setPhase('enunciado')
          await speak(
            `Questão ${i + 1}. ${questao.enunciado || questao.pergunta || ''}`,
            controller.signal
          )

          setPhase('alternativas')
          if (isCE) {
            await speak(
              'Esta questão é de certo ou errado. Alternativa C: Certo. Alternativa E: Errado.',
              controller.signal
            )
          } else if (alts.length) {
            for (const [letra, texto] of alts) {
              await speak(`Alternativa ${letra}: ${texto}`, controller.signal)
            }
          }

          setPhase('ask')
          await speak('Qual é a resposta correta? Toque na alternativa.', controller.signal)

          setPhase('awaiting')
          setStatus('playing')
          const { selected } = await waitForUserAnswer(controller.signal)
          const selectedNorm = String(selected || '').toUpperCase()
          const correct = selectedNorm && gabarito && selectedNorm === gabarito

          setPhase('feedback')
          if (correct) {
            await speak(`Correto! A resposta é ${gabarito}.`, controller.signal)
          } else {
            await speak(
              `Incorreto. A resposta correta é ${gabarito || 'não informada'}.`,
              controller.signal
            )
          }

          if (explicacao) {
            setPhase('explicacao')
            await speak(`Explicação. ${explicacao}`, controller.signal)
          }

          const isLast = i >= questoesRef.current.length - 1
          setPhase('next')
          if (isLast) {
            await speak('Chegamos à última questão. Bom trabalho!', controller.signal)
            setPhase('done')
            setStatus('idle')
            playingRef.current = false
            return
          }

          await speak('Vamos para a próxima questão.', controller.signal)
          onGoNext?.()
          i += 1
          await new Promise((r) => setTimeout(r, 400))
        }
      } catch (err) {
        if (err?.name === 'AbortError') return
        console.error('[SmartTeacherQuestoes]', err)
        setError(err?.message || 'Falha na leitura das questões')
        setStatus('idle')
        setPhase('idle')
        playingRef.current = false
      }
    },
    [supported, stopAll, speak, waitForUserAnswer, onGoNext, deckTitle, tipoProva]
  )

  const play = useCallback(() => {
    if (status === 'paused' && playingRef.current) {
      pausedRef.current = false
      resumeSpeech()
      setStatus('playing')
      return
    }
    runSessionFrom(currentIndex)
  }, [status, runSessionFrom, currentIndex])

  const pause = useCallback(() => {
    if (!playingRef.current) return
    pausedRef.current = true
    pauseSpeech()
    setStatus('paused')
  }, [])

  const stop = useCallback(() => {
    stopAll()
  }, [stopAll])

  return {
    supported,
    status,
    phase,
    thinkRemaining: 0,
    settings,
    updateSettings,
    selectedVoice,
    availableVoices,
    error,
    play,
    pause,
    stop,
  }
}

export default useSmartTeacherQuestoes
