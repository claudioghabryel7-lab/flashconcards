import React, { memo } from 'react'
import { CheckIcon } from '@heroicons/react/24/solid'
import { DAY_TYPE_CONFIG } from './mentoradoCalendarUtils'

function CalendarDayCell({ day, onDayClick }) {
  if (day.empty) {
    return <div className="min-h-[4.5rem] sm:min-h-[5.5rem]" aria-hidden />
  }

  const { date, dayKey, data, isToday, isPast, isExamDay } = day
  const typeConfig = data ? DAY_TYPE_CONFIG[data.type] || DAY_TYPE_CONFIG.estudo : null
  const materiaCount = data?.materias?.length || 0
  const firstMateria = data?.materias?.[0]?.disciplina || data?.materias?.[0]?.materia

  return (
    <button
      type="button"
      onClick={data ? () => onDayClick(dayKey) : undefined}
      disabled={!data}
      className={[
        'group relative flex min-h-[4.5rem] flex-col rounded-xl border p-2 text-left transition sm:min-h-[5.5rem] sm:p-2.5',
        data ? 'cursor-pointer hover:border-[var(--cp-accent)]/35 hover:shadow-[0_0_0_1px_var(--cp-glow)]' : 'cursor-default',
        isToday
          ? 'border-[var(--cp-accent-2)]/50 bg-[var(--cp-accent-2)]/8 ring-1 ring-[var(--cp-accent-2)]/40'
          : isExamDay
          ? 'border-[var(--cp-accent-3)]/40 bg-[var(--cp-accent-3)]/6'
          : 'border-cp-border bg-cp-surface/60',
        isPast && !data?.completed ? 'opacity-80' : '',
      ].join(' ')}
      aria-label={
        data
          ? `${date.format('D')} de ${date.format('MMMM')}: ${typeConfig?.label || 'atividade'}`
          : `${date.format('D')} de ${date.format('MMMM')}`
      }
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className={[
            'font-mono text-sm font-semibold leading-none sm:text-base',
            isToday ? 'text-[var(--cp-accent-2)]' : isPast ? 'text-cp-muted' : 'text-cp-text',
          ].join(' ')}
        >
          {date.date()}
        </span>
        {data?.completed && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--cp-success)]/15">
            <CheckIcon className="h-2.5 w-2.5 text-[var(--cp-success)]" />
          </span>
        )}
        {isExamDay && !data?.completed && (
          <span className="rounded-full bg-[var(--cp-accent-3)]/15 px-1.5 py-0.5 font-mono text-[9px] font-medium text-[var(--cp-accent-3)]">
            Prova
          </span>
        )}
      </div>

      {data && typeConfig && (
        <div className="mt-auto space-y-1 pt-1.5">
          <span
            className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-medium sm:text-[10px] ${typeConfig.className}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${typeConfig.dot}`} />
            <span className="truncate">{typeConfig.short}</span>
          </span>
          {firstMateria && (
            <p className="truncate text-[9px] text-cp-muted sm:text-[10px]" title={firstMateria}>
              {firstMateria}
              {materiaCount > 1 ? ` +${materiaCount - 1}` : ''}
            </p>
          )}
        </div>
      )}

      {isToday && (
        <span className="pointer-events-none absolute -bottom-px left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-[var(--cp-accent-2)]" />
      )}
    </button>
  )
}

export default memo(CalendarDayCell, (prev, next) => {
  if (prev.day.key !== next.day.key) return false
  if (prev.day.isToday !== next.day.isToday) return false
  if (prev.day.isExamDay !== next.day.isExamDay) return false

  const prevData = prev.day.data
  const nextData = next.day.data
  if (!prevData && !nextData) return true
  if (!prevData || !nextData) return false

  return (
    prevData.type === nextData.type &&
    prevData.completed === nextData.completed &&
    (prevData.materias?.length || 0) === (nextData.materias?.length || 0) &&
    prev.onDayClick === next.onDayClick
  )
})
