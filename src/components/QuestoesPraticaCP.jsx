import { FireIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import CommentFormattedText from './content/CommentFormattedText'
import { probabilidadeBadgeClass } from '../utils/htmlTextHelpers'
import ContentFeedbackActions from './content/ContentFeedbackActions'

export function resolveQuestaoGabarito(questao) {
  return questao?.respostaCorreta || questao?.correta || questao?.gabarito || ''
}

export function resolveQuestaoExplicacao(questao) {
  return (
    questao?.explicacao ||
    questao?.gabaritoComentado ||
    questao?.comentario ||
    questao?.justificativa ||
    ''
  )
}

function normalizeAlternativas(questao) {
  const raw = questao?.alternativas
  if (!raw) return {}
  if (Array.isArray(raw)) {
    const letters = ['A', 'B', 'C', 'D', 'E']
    return Object.fromEntries(
      raw.map((value, index) => [letters[index] || String(index), String(value)]),
    )
  }
  return raw
}

function alternativaClassName({ reveal, isCorrect, isSelected, idle }) {
  if (reveal) {
    if (isCorrect) {
      return 'border-emerald-500/60 bg-emerald-500/12 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]'
    }
    if (isSelected) {
      return 'border-red-500/60 bg-red-500/12 shadow-[0_0_0_1px_rgba(239,68,68,0.2)]'
    }
    return 'border-cp-border bg-cp-surface/40 opacity-60'
  }
  if (idle) {
    return 'border-cp-border bg-cp-surface hover:-translate-y-0.5 hover:border-cp-accent/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]'
  }
  return 'border-cp-border bg-cp-surface/50'
}

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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cp-accent/30 bg-gradient-to-br from-cp-accent/15 to-cp-accent2/10">
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

export function NivelSelector({ niveis, nivelAtual, niveisComConteudo, onSelect }) {
  if (!niveis?.length) return null
  const comConteudo = niveisComConteudo || []
  return (
    <div className="flex flex-wrap gap-2">
      {niveis.map((nivel) => (
        <button
          key={nivel}
          type="button"
          onClick={() => onSelect(nivel)}
          className={`rounded-full px-3.5 py-1.5 font-mono text-xs transition ${
            nivel === nivelAtual
              ? 'border border-cp-accent/40 bg-cp-accent/15 text-cp-accent shadow-[0_0_0_1px_var(--cp-glow)]'
              : comConteudo.includes(nivel)
                ? 'border border-cp-border bg-cp-surface text-cp-text hover:border-cp-accent/30'
                : 'border border-dashed border-cp-border/70 bg-cp-bg/40 text-cp-muted hover:border-cp-accent/30'
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
  const pct = ((current + 1) / total) * 100
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-cp-muted">
          Questão {current + 1} de {total}
          {extraLabel || ''}
        </p>
        <span className="font-mono text-[11px] text-cp-accent">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-cp-border/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cp-accent via-cp-accent2 to-cp-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function QuestaoEnunciadoCard({
  assunto,
  probabilidade,
  enunciado,
  questionNumber,
  feedbackSlot,
  courseId,
  contentId,
  alternateContentIds = [],
  topicKey,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-cp-border bg-gradient-to-br from-cp-surface via-cp-bg-elevated to-cp-surface shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
      <div className="border-b border-cp-border/80 bg-gradient-to-r from-cp-accent/8 via-transparent to-cp-accent2/8 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {questionNumber != null && (
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-cp-accent/25 bg-cp-accent/10 font-mono text-xs font-bold text-cp-accent">
                {questionNumber}
              </span>
            )}
            <span className="text-xs font-medium text-cp-muted">{assunto || 'Assunto'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {probabilidade != null && probabilidade !== '' && (
              <span
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] ${probabilidadeBadgeClass(probabilidade)}`}
              >
                {probabilidade}% chance
              </span>
            )}
            {feedbackSlot}
            {courseId && contentId && (
              <ContentFeedbackActions
                courseId={courseId}
                contentType="questao"
                contentId={contentId}
                alternateContentIds={alternateContentIds}
                topicKey={topicKey}
                preview={enunciado}
                materia={assunto}
                assunto={assunto}
                contextLabel="esta questão"
                variant="inline"
              />
            )}
          </div>
        </div>
      </div>
      <div className="px-4 py-5 sm:px-5 sm:py-6">
        <CommentFormattedText text={enunciado} className="text-base font-medium text-cp-text sm:text-lg" />
      </div>
    </div>
  )
}

export function QuestaoAlternativas({
  tipoProva,
  questao,
  showResult,
  modoAdminNavegacao,
  selectedAnswer = null,
  onAnswer,
}) {
  const correta = resolveQuestaoGabarito(questao)
  const reveal = showResult || modoAdminNavegacao

  if (tipoProva === 'Certo/Errado') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {['C', 'E'].map((key) => {
          const isCorrect = key === correta
          const isSelected = selectedAnswer === key
          const idle = !reveal
          return (
            <button
              key={key}
              type="button"
              onClick={() => !modoAdminNavegacao && onAnswer(key)}
              disabled={reveal || modoAdminNavegacao}
              className={`rounded-2xl border-2 p-5 transition-all duration-200 ${alternativaClassName({
                reveal,
                isCorrect,
                isSelected,
                idle,
              })}`}
            >
              <div className="flex flex-col items-center gap-1.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-cp-border bg-cp-bg font-mono text-lg font-bold text-cp-text">
                  {key}
                </span>
                <span className="text-xs font-medium text-cp-muted">{key === 'C' ? 'Certo' : 'Errado'}</span>
                {reveal && isCorrect && <CheckCircleIcon className="h-5 w-5 text-emerald-400" />}
                {reveal && isSelected && !isCorrect && <XCircleIcon className="h-5 w-5 text-red-400" />}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  const alternativas = normalizeAlternativas(questao)

  return (
    <div className="space-y-2.5">
      {Object.entries(alternativas).map(([key, value]) => {
        const isCorrect = key === correta
        const isSelected = selectedAnswer === key
        const idle = !reveal
        return (
          <button
            key={key}
            type="button"
            onClick={() => !modoAdminNavegacao && onAnswer(key)}
            disabled={reveal || modoAdminNavegacao}
            className={`w-full rounded-2xl border-2 p-4 text-left transition-all duration-200 ${alternativaClassName({
              reveal,
              isCorrect,
              isSelected,
              idle,
            })}`}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cp-accent/20 bg-cp-accent/10 font-mono text-sm font-bold text-cp-accent">
                {key}
              </span>
              <span className="pt-1 text-sm leading-relaxed text-cp-text">
                <CommentFormattedText text={value} />
              </span>
              {reveal && isCorrect && (
                <CheckCircleIcon className="ml-auto h-5 w-5 shrink-0 text-emerald-400" />
              )}
              {reveal && isSelected && !isCorrect && (
                <XCircleIcon className="ml-auto h-5 w-5 shrink-0 text-red-400" />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function QuestaoExplicacao({ explicacao, editSlot }) {
  const texto = explicacao?.trim() || 'Explicação não disponível para esta questão.'
  return (
    <div className="rounded-2xl border border-cp-border bg-gradient-to-br from-cp-bg/60 to-cp-surface/80 p-4 sm:p-5">
      <h4 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-cp-muted">Explicação</h4>
      {editSlot}
      <div className="text-sm leading-relaxed text-cp-muted">
        <CommentFormattedText text={texto} />
      </div>
    </div>
  )
}

export function ResultadoDesempenho({ desempenho }) {
  return (
    <div className="cp-card p-8 text-center space-y-6">
      <h2 className="cp-headline text-xl">Prática concluída</h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-cp-border bg-cp-surface p-4">
          <p className="font-mono text-[10px] uppercase text-cp-muted">Acertos</p>
          <p className="mt-1 text-2xl font-medium text-emerald-400">{desempenho.acertos}</p>
        </div>
        <div className="rounded-2xl border border-cp-border bg-cp-surface p-4">
          <p className="font-mono text-[10px] uppercase text-cp-muted">Erros</p>
          <p className="mt-1 text-2xl font-medium text-red-400">{desempenho.erros}</p>
        </div>
        <div className="rounded-2xl border border-cp-border bg-cp-surface p-4">
          <p className="font-mono text-[10px] uppercase text-cp-muted">Aproveitamento</p>
          <p className="mt-1 text-2xl font-medium text-cp-accent2">{desempenho.aproveitamento}%</p>
        </div>
      </div>
    </div>
  )
}
