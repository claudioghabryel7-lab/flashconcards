import React, { memo, useMemo, useCallback } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import CalendarDayCell from './CalendarDayCell'
import {
  WEEK_DAYS,
  DAY_TYPE_CONFIG,
  buildMonthDays,
  computeMonthStats,
} from './mentoradoCalendarUtils'

dayjs.locale('pt-br')

function MentoradoCalendar({
  currentMonth,
  cronograma,
  examDate,
  loading,
  onPreviousMonth,
  onNextMonth,
  onGoToday,
  onDayClick,
}) {
  const days = useMemo(
    () => buildMonthDays(currentMonth, cronograma, examDate),
    [currentMonth, cronograma, examDate]
  )

  const stats = useMemo(() => computeMonthStats(days, examDate), [days, examDate])

  const handleDayClick = useCallback(
    (dayKey) => {
      onDayClick(dayKey)
    },
    [onDayClick]
  )

  const legendItems = useMemo(
    () => Object.entries(DAY_TYPE_CONFIG).slice(0, 5),
    []
  )

  return (
    <div className="cp-card overflow-hidden !rounded-2xl !p-0">
      {/* Cabeçalho */}
      <div className="border-b border-cp-border bg-gradient-to-r from-[var(--cp-accent)]/8 via-transparent to-[var(--cp-accent-2)]/8 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cp-border bg-cp-surface">
              <CalendarDaysIcon className="h-5 w-5 text-[var(--cp-accent)]" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">
                Cronograma mensal
              </p>
              <h2 className="cp-headline text-xl capitalize text-cp-text sm:text-2xl">
                {currentMonth.format('MMMM [de] YYYY')}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGoToday}
              className="rounded-full border border-cp-border px-3 py-1.5 font-mono text-xs text-cp-muted transition hover:border-cp-border-hover hover:bg-cp-surface hover:text-cp-text"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={onPreviousMonth}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-cp-border text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
              aria-label="Mês anterior"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNextMonth}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-cp-border text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
              aria-label="Próximo mês"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-cp-border bg-cp-surface/80 px-3 py-2">
            <p className="font-mono text-[10px] text-cp-muted">Concluídos</p>
            <p className="text-lg font-semibold text-[var(--cp-success)]">
              {stats.completed}
              <span className="text-sm font-normal text-cp-muted">/{stats.total}</span>
            </p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/80 px-3 py-2">
            <p className="font-mono text-[10px] text-cp-muted">Dias planejados</p>
            <p className="text-lg font-semibold text-cp-text">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-cp-border bg-cp-surface/80 px-3 py-2">
            <p className="font-mono text-[10px] text-cp-muted">Até a prova</p>
            <p className="text-lg font-semibold text-[var(--cp-accent-2)]">
              {stats.daysToExam != null ? `${stats.daysToExam}d` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-2 border-b border-cp-border px-4 py-3 sm:px-6">
        {legendItems.map(([type, cfg]) => (
          <span
            key={type}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] ${cfg.className}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        ))}
      </div>

      {/* Grade */}
      <div className="p-3 sm:p-4">
        <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEK_DAYS.map((day) => (
            <div
              key={day}
              className="py-1 text-center font-mono text-[10px] font-semibold uppercase tracking-wide text-cp-muted sm:text-xs"
            >
              {day}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="min-h-[4.5rem] animate-pulse rounded-xl border border-cp-border bg-cp-surface/40 sm:min-h-[5.5rem]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {days.map((day) => (
              <CalendarDayCell key={day.key} day={day} onDayClick={handleDayClick} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(MentoradoCalendar)
