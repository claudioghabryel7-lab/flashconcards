import { useState, useEffect, useRef } from 'react'
import { SpeakerWaveIcon, SpeakerXMarkIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/outline'

const AudioReader = ({ text, className = '' }) => {
  const [isReading, setIsReading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isSupported, setIsSupported] = useState(true)
  const [voices, setVoices] = useState([])
  const [selectedVoice, setSelectedVoice] = useState(null)
  const [speechRate, setSpeechRate] = useState(1)
  const utteranceRef = useRef(null)

  useEffect(() => {
    // Verificar suporte a speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setIsSupported(true)
      
      // Carregar vozes disponíveis
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices()
        setVoices(availableVoices)
        
        // Selecionar voz em português por padrão
        const portugueseVoice = availableVoices.find(voice => 
          voice.lang.includes('pt') || voice.lang.includes('PT')
        )
        setSelectedVoice(portugueseVoice || availableVoices[0])
      }

      loadVoices()
      
      // Algumas vezes as vozes demoram para carregar
      window.speechSynthesis.onvoiceschanged = loadVoices
    } else {
      setIsSupported(false)
    }
  }, [])

  const startReading = () => {
    if (!text || !isSupported) return

    // Parar qualquer leitura anterior
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utteranceRef.current = utterance

    // Configurar voz
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }

    // Configurar velocidade
    utterance.rate = speechRate
    utterance.pitch = 1
    utterance.volume = 1

    // Eventos
    utterance.onstart = () => {
      setIsReading(true)
      setIsPaused(false)
    }

    utterance.onend = () => {
      setIsReading(false)
      setIsPaused(false)
    }

    utterance.onerror = (event) => {
      console.error('Erro na leitura:', event)
      setIsReading(false)
      setIsPaused(false)
    }

    // Iniciar leitura
    window.speechSynthesis.speak(utterance)
  }

  const stopReading = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
      setIsReading(false)
      setIsPaused(false)
    }
  }

  const pauseReading = () => {
    if (window.speechSynthesis && isReading && !isPaused) {
      window.speechSynthesis.pause()
      setIsPaused(true)
    }
  }

  const resumeReading = () => {
    if (window.speechSynthesis && isReading && isPaused) {
      window.speechSynthesis.resume()
      setIsPaused(false)
    }
  }

  const toggleReading = () => {
    if (!isReading) {
      startReading()
    } else if (isPaused) {
      resumeReading()
    } else {
      pauseReading()
    }
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
    <div className={`bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm border border-slate-200 dark:border-slate-700 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SpeakerWaveIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Leitura de Áudio
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={toggleReading}
            disabled={!text}
            className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white transition-colors"
            title={isReading ? (isPaused ? 'Continuar' : 'Pausar') : 'Iniciar leitura'}
          >
            {isReading ? (
              isPaused ? (
                <PlayIcon className="h-4 w-4" />
              ) : (
                <PauseIcon className="h-4 w-4" />
              )
            ) : (
              <PlayIcon className="h-4 w-4" />
            )}
          </button>
          
          {isReading && (
            <button
              onClick={stopReading}
              className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
              title="Parar leitura"
            >
              <SpeakerXMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Controles */}
      <div className="space-y-2">
        {/* Seleção de voz */}
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
            Voz:
          </label>
          <select
            value={selectedVoice?.name || ''}
            onChange={(e) => {
              const voice = voices.find(v => v.name === e.target.value)
              setSelectedVoice(voice)
            }}
            className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300"
          >
            {voices.map(voice => (
              <option key={voice.name} value={voice.name}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
        </div>

        {/* Velocidade */}
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
            Velocidade: {speechRate}x
          </label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={speechRate}
            onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Status */}
      {isReading && (
        <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
          {isPaused ? '⏸️ Pausado' : '🔊 Lendo...'}
        </div>
      )}
    </div>
  )
}

export default AudioReader
