import { FireIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import ReactMarkdown from 'react-markdown'
import { probabilidadeBadgeClass } from '../utils/htmlTextHelpers'

export function QuestoesLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
        <p className="mt-4 text-sm text-cp-muted">Carregando questões…</p>
      </div>
    </div>
  )
}

export function QuestoesHeader({ badge, title, subtitle, backLink }) {
  return (
    <>
      {backLink}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cp-accent/30 bg-cp-accent/10">
            <FireIcon className="h-6 w-6 text-cp-accent" />
          </div>
          <div>
            <span className="cp-badge cp-badge-accent mb-2">{badge}</span>
            <h1 className="cp-headline text-xl sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-cp-muted">{subtitle}</p>}
          </div>
        </div>
      </div>
    </>
  )
}

export function NivelSelector({ niveis, nivelAtual, onSelect }) {
  if (!niveis?.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {niveis.map((nivel) => (
        <button
          key={nivel}
          type="button"
          onClick={() => onSelect(nivel)}
          className={`rounded-lg px-3 py-1.5 font-mono text-xs transition ${
            nivel === nivelAtual
              ? 'border border-cp-accent/40 bg-cp-accent/15 text-cp-accent'
              : 'border border-cp-border bg-cp-surface text-cp-muted hover:border-cp-accent/30'
          }`}
        >
          Nível {nivel}
        </button>
      ))}
    </div>
  )
}

export function QuestoesProgressBar({ current, total, extraLabel }) {
  if (!total) return null
  return (
    <>
      <div className="h-1.5 overflow-hidden rounded-full bg-cp-border mb-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cp-accent to-cp-accent2 transition-all duration-300"
          style={{ width: `${((current + 1) / total) * 100}%` }}
        />
      </div>
      <p className="text-xs font-mono text-cp-muted text-center mb-4">
        Questão {current + 1} de {total}
        {extraLabel || ''}
      </p>
    </>
  )
}

export function QuestaoEnunciadoCard({ assunto, probabilidade, enunciado }) {
  return (
    <div className="rounded-xl border border-cp-border p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-mono text-cp-muted">{assunto || 'Assunto'}</span>
        {probabilidade != null && probabilidade !== '' && (
          <span className={`font-mono text-[10px] px-2 py-0.5 rounded-full border ${probabilidadeBadgeClass(probabilidade)}`}>
            {probabilidade}% chance
          </span>
        )}
      </div>
      <p className="text-sm text-cp-text font-medium">{enunciado}</p>
    </div>
  )
}

export function QuestaoAlternativas({
  tipoProva,
  questao,
  showResult,
  modoAdminNavegacao,
  onAnswer,
}) {
  const correta = questao.respostaCorreta || questao.correta

  if (tipoProva === 'Certo/Errado') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {['C', 'E'].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => !modoAdminNavegacao && onAnswer(key)}
            disabled={showResult || modoAdminNavegacao}
            className={`rounded-xl border-2 p-5 transition ${
              modoAdminNavegacao || showResult
                ? key === correta
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-cp-border bg-cp-surface/50 opacity-50'
                : 'border-cp-border bg-cp-surface hover:border-cp-accent/40'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl font-bold text-cp-text">{key}</span>
              <span className="text-xs text-cp-muted">{key === 'C' ? 'Certo' : 'Errado'}</span>
              {(modoAdminNavegacao || showResult) && key === correta && (
                <CheckCircleIcon className="h-5 w-5 text-emerald-400" />
              )}
            </div>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {Object.entries(questao.alternativas || {}).map(([key, value]) => (
        <button
          key={key}
          type="button"
          onClick={() => !modoAdminNavegacao && onAnswer(key)}
          disabled={showResult || modoAdminNavegacao}
          className={`w-full text-left rounded-xl border-2 p-4 transition ${
            modoAdminNavegacao || showResult
              ? key === correta
                ? 'border-emerald-500/50 bg-emerald-500/10'
                : 'border-cp-border bg-cp-surface/50 opacity-50'
              : 'border-cp-border bg-cp-surface hover:border-cp-accent/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-cp-accent">{key})</span>
            <span className="text-sm text-cp-text">{value}</span>
            {(modoAdminNavegacao || showResult) && key === correta && (
              <CheckCircleIcon className="h-5 w-5 text-emerald-400 ml-auto" />
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

export function QuestaoExplicacao({ explicacao, editSlot }) {
  return (
    <div className="rounded-xl border border-cp-border/60 bg-cp-bg/40 p-4">
      <h4 className="font-mono text-[10px] uppercase text-cp-muted mb-2">Explicação</h4>
      {editSlot || (
        <div className="prose prose-sm dark:prose-invert max-w-none text-cp-muted">
          <ReactMarkdown>{explicacao || 'Explicação não disponível'}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

export function ResultadoDesempenho({ desempenho }) {
  return (
    <div className="cp-card p-8 text-center space-y-6">
      <h2 className="cp-headline text-xl">Prática concluída</h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="cp-card p-4">
          <p className="font-mono text-[10px] uppercase text-cp-muted">Acertos</p>
          <p className="mt-1 text-2xl font-medium text-emerald-400">{desempenho.acertos}</p>
        </div>
        <div className="cp-card p-4">
          <p className="font-mono text-[10px] uppercase text-cp-muted">Erros</p>
          <p className="mt-1 text-2xl font-medium text-red-400">{desempenho.erros}</p>
        </div>
        <div className="cp-card p-4">
          <p className="font-mono text-[10px] uppercase text-cp-muted">Aproveitamento</p>
          <p className="mt-1 text-2xl font-medium text-cp-accent2">{desempenho.aproveitamento}%</p>
        </div>
      </div>
    </div>
  )
}
