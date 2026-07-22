import { useEffect, useRef, useState } from 'react'
import {
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
} from '@heroicons/react/24/outline'
import {
  buildMaterialIntro,
  cancelSpeech,
  getTeacherSettings,
  isSpeechSupported,
  pauseSpeech,
  pickTeacherVoice,
  prepareSpeechText,
  resumeSpeech,
  saveTeacherSettings,
  speakText,
  waitForVoices,
} from '../services/teacherSpeechService'

/**
 * Leitor de materiais com Modo Professor (voz local, sem API de IA).
 */
const AudioReader = ({ text, title = '', className = '', showIntro = true }) => {
  const [isReading, setIsReading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isSupported] = useState(() => isSpeechSupported())
  const [voices, setVoices] = useState([])
  const [settings, setSettings] = useState(() => getTeacherSettings())
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  useEffect(() => {
    if (!isSupported) return undefined

    let alive = true
    waitForVoices().then((list) => {
      if (alive) setVoices(list)
    })
    return () => {
      alive = false
      if (abortRef.current) abortRef.current.abort()
      cancelSpeech()
    }
  }, [isSupported])

  const selectedVoice = pickTeacherVoice(voices, settings.gender)

  const updateSettings = (partial) => {
    setSettings(saveTeacherSettings(partial))
  }

  const stopReading = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    cancelSpeech()
    setIsReading(false)
    setIsPaused(false)
  }

  const startReading = async () => {
    const clean = prepareSpeechText(text)
    if (!clean || !isSupported) return

    stopReading()
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setIsReading(true)
    setIsPaused(false)

    try {
      const voice = pickTeacherVoice(voices, settings.gender)
      if (showIntro) {
        await speakText(buildMaterialIntro(title), {
          voice,
          gender: settings.gender,
          rate: settings.speechRate,
          signal: controller.signal,
        })
      }
      await speakText(clean, {
        voice,
        gender: settings.gender,
        rate: settings.speechRate,
        signal: controller.signal,
      })
      setIsReading(false)
      setIsPaused(false)
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Erro na leitura:', err)
      setError(err?.message || 'Falha na leitura')
      setIsReading(false)
      setIsPaused(false)
    }
  }

  const pauseReading = () => {
    if (!isReading || isPaused) return
    pauseSpeech()
    setIsPaused(true)
  }

  const resumeReading = () => {
    if (!isReading || !isPaused) return
    resumeSpeech()
    setIsPaused(false)
  }

  const toggleReading = () => {
    if (!isReading) startReading()
    else if (isPaused) resumeReading()
    else pauseReading()
  }

  if (!isSupported) {
    return (
      <div className={`flex items-center gap-2 text-xs text-slate-500 ${className}`}>
        <SpeakerXMarkIcon className="h-4 w-4" />
        <span>Leitura de áudio não suportada</span>
      </div>
    )
  }

  return (
    <div
      className={`rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-white to-emerald-500/5 p-3 shadow-sm dark:via-slate-800 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SpeakerWaveIcon className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Modo Professor
            </p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {selectedVoice?.name || 'Voz local'} · sem IA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleReading}
            disabled={!text}
            className="rounded-lg bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600"
            title={isReading ? (isPaused ? 'Continuar' : 'Pausar') : 'Ouvir material'}
          >
            {isReading ? (
              isPaused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />
            ) : (
              <PlayIcon className="h-4 w-4" />
            )}
          </button>

          {isReading && (
            <button
              type="button"
              onClick={stopReading}
              className="rounded-lg bg-red-600 p-2 text-white transition-colors hover:bg-red-700"
              title="Parar leitura"
            >
              <StopIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">Voz do professor</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => updateSettings({ gender: 'female' })}
              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                settings.gender === 'female'
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
              }`}
            >
              Feminina
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ gender: 'male' })}
              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                settings.gender === 'male'
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
              }`}
            >
              Masculina
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Velocidade: {Number(settings.speechRate).toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.7"
            max="1.25"
            step="0.05"
            value={settings.speechRate}
            onChange={(e) => updateSettings({ speechRate: parseFloat(e.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 dark:bg-slate-600"
          />
        </div>
      </div>

      {isReading && (
        <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400">
          {isPaused ? 'Pausado' : 'Lendo com pausas naturais…'}
        </div>
      )}
      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
    </div>
  )
}

export default AudioReader
