import { useState } from 'react'
import {
  AcademicCapIcon,
  Cog6ToothIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
  SpeakerWaveIcon,
} from '@heroicons/react/24/outline'
import { THINK_TIME_OPTIONS } from '../../services/teacherSpeechService'

const PHASE_LABELS = {
  idle: 'Pronto para ensinar',
  intro: 'Apresentando o flashcard…',
  front: 'Lendo a frente…',
  thinking: 'Tempo para pensar',
  back: 'Lendo o verso…',
  next: 'Indo ao próximo…',
  done: 'Sessão concluída',
}

/**
 * Painel do Modo Professor (sem API de IA).
 * Controles: play/pause/stop, voz M/F, tempo para virar o card.
 */
export default function SmartTeacherPlayer({
  supported,
  status,
  phase,
  thinkRemaining,
  settings,
  updateSettings,
  selectedVoice,
  error,
  onPlay,
  onPause,
  onStop,
  compact = false,
  className = '',
}) {
  const [showConfig, setShowConfig] = useState(false)
  const isActive = status === 'playing' || status === 'thinking' || status === 'paused'

  if (!supported) {
    return (
      <div className={`rounded-2xl border border-cp-border bg-cp-surface/80 px-3 py-2 text-xs text-cp-muted ${className}`}>
        Leitura de áudio não suportada neste navegador.
      </div>
    )
  }

  return (
    <div
      className={`rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 via-cp-surface to-emerald-500/5 p-3 sm:p-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AcademicCapIcon className="h-5 w-5 shrink-0 text-indigo-500" />
            <p className="text-sm font-semibold text-cp-text">Modo Professor</p>
          </div>
          {!compact && (
            <p className="mt-1 text-[11px] leading-relaxed text-cp-muted">
              Voz local profissional — sem IA. Lê a frente, conta o tempo, vira e lê o verso.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowConfig((v) => !v)}
          className="noji-tool-btn"
          title="Configurar leitura"
          aria-expanded={showConfig}
        >
          <Cog6ToothIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (status === 'playing' || status === 'thinking') onPause?.()
            else onPlay?.()
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 active:scale-[0.98]"
        >
          {status === 'playing' || status === 'thinking' ? (
            <>
              <PauseIcon className="h-4 w-4" />
              Pausar
            </>
          ) : (
            <>
              <PlayIcon className="h-4 w-4" />
              {status === 'paused' ? 'Continuar' : 'Ouvir aula'}
            </>
          )}
        </button>

        {isActive && (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cp-border bg-cp-bg px-3 py-2 text-xs font-semibold text-cp-text transition hover:border-red-400/50 hover:text-red-500"
          >
            <StopIcon className="h-4 w-4" />
            Parar
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-cp-muted">
          <SpeakerWaveIcon className="h-3.5 w-3.5" />
          <span className="max-w-[140px] truncate sm:max-w-[220px]">
            {selectedVoice?.name || 'Voz do sistema'}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={`rounded-lg px-2 py-1 font-medium ${
            status === 'thinking'
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : status === 'paused'
                ? 'bg-slate-500/15 text-cp-muted'
                : status === 'playing'
                  ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  : 'bg-cp-bg text-cp-muted'
          }`}
        >
          {status === 'thinking' && thinkRemaining > 0
            ? `Pensar: ${thinkRemaining}s`
            : PHASE_LABELS[phase] || PHASE_LABELS.idle}
        </span>
        {status === 'thinking' && (
          <span className="font-mono tabular-nums text-amber-600 dark:text-amber-300">
            tick… tick…
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}

      {showConfig && (
        <div className="mt-3 space-y-3 rounded-xl border border-cp-border bg-cp-bg/80 p-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-cp-muted">
              Voz do professor
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateSettings({ gender: 'female' })}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  settings.gender === 'female'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                    : 'border-cp-border text-cp-muted hover:border-indigo-400/40'
                }`}
              >
                Feminina
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ gender: 'male' })}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  settings.gender === 'male'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                    : 'border-cp-border text-cp-muted hover:border-indigo-400/40'
                }`}
              >
                Masculina
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-cp-muted">
              Prioriza vozes Natural/Neural do seu aparelho (Edge/Chrome/iOS costumam soar mais humanas).
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-cp-muted">
              Tempo para pensar (antes de virar)
            </label>
            <select
              value={settings.thinkSeconds}
              onChange={(e) => updateSettings({ thinkSeconds: Number(e.target.value) })}
              className="w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-xs text-cp-text"
            >
              {THINK_TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-cp-muted">
              Velocidade: {Number(settings.speechRate).toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.7"
              max="1.25"
              step="0.05"
              value={settings.speechRate}
              onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-cp-text">
            <input
              type="checkbox"
              checked={settings.autoAdvance !== false}
              onChange={(e) => updateSettings({ autoAdvance: e.target.checked })}
              className="rounded border-cp-border"
            />
            Avançar automaticamente após o verso
          </label>
        </div>
      )}
    </div>
  )
}
