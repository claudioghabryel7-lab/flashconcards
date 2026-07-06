import dayjs from 'dayjs'

export const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export const DAY_TYPE_CONFIG = {
  estudo: {
    label: 'Estudo',
    short: 'Est.',
    className: 'bg-[var(--cp-accent)]/12 text-[var(--cp-accent)] border-[var(--cp-accent)]/25',
    dot: 'bg-[var(--cp-accent)]',
  },
  taf: {
    label: 'TAF',
    short: 'TAF',
    className: 'bg-[var(--cp-accent-4)]/12 text-[var(--cp-accent-4)] border-[var(--cp-accent-4)]/25',
    dot: 'bg-[var(--cp-accent-4)]',
  },
  redacao: {
    label: 'Redação',
    short: 'Red.',
    className: 'bg-[var(--cp-accent-3)]/12 text-[var(--cp-accent-3)] border-[var(--cp-accent-3)]/25',
    dot: 'bg-[var(--cp-accent-3)]',
  },
  revisao: {
    label: 'Revisão',
    short: 'Rev.',
    className: 'bg-[var(--cp-success)]/12 text-[var(--cp-success)] border-[var(--cp-success)]/25',
    dot: 'bg-[var(--cp-success)]',
  },
  simulado: {
    label: 'Simulado',
    short: 'Sim.',
    className: 'bg-[var(--cp-accent)]/18 text-[var(--cp-accent)] border-[var(--cp-accent)]/30',
    dot: 'bg-[var(--cp-accent)]',
  },
  reta_final: {
    label: 'Reta final',
    short: 'Final',
    className: 'bg-red-500/12 text-red-500 border-red-500/25',
    dot: 'bg-red-500',
  },
}

export function buildMonthDays(currentMonth, cronograma, examDate) {
  const result = []
  const firstDay = currentMonth.startOf('month')
  const lastDay = currentMonth.endOf('month')
  const today = dayjs()
  const examKey = examDate ? dayjs(examDate).format('YYYY-MM-DD') : null

  const startDayOfWeek = firstDay.day()
  for (let i = 0; i < startDayOfWeek; i++) {
    result.push({ empty: true, key: `pad-${i}` })
  }

  for (let i = 1; i <= lastDay.date(); i++) {
    const date = currentMonth.date(i)
    const dayKey = date.format('YYYY-MM-DD')
    const dayData = cronograma?.days?.[dayKey] || null

    result.push({
      key: dayKey,
      empty: false,
      date,
      dayKey,
      data: dayData,
      isToday: date.isSame(today, 'day'),
      isPast: date.isBefore(today, 'day'),
      isExamDay: examKey === dayKey,
    })
  }

  return result
}

export function computeMonthStats(days, examDate) {
  const studyDays = days.filter((d) => !d.empty && d.data)
  const completed = studyDays.filter((d) => d.data?.completed).length
  const total = studyDays.length
  const daysToExam =
    examDate && dayjs(examDate).isAfter(dayjs())
      ? dayjs(examDate).diff(dayjs(), 'day')
      : null

  return { completed, total, daysToExam }
}
