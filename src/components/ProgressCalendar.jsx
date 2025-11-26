import dayjs from 'dayjs'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const ProgressCalendar = ({ dates = [], streak = 0 }) => {
  const { darkMode } = useDarkMode()
  const studied = new Set(dates)
  const lastDays = Array.from({ length: 14 }, (_, index) =>
    dayjs().subtract(13 - index, 'day'),
  )

  return (
    <div 
      className="rounded-2xl p-6 shadow-sm"
      style={{
        backgroundColor: darkMode ? '#1e293b' : '#ffffff',
        color: darkMode ? '#f1f5f9' : '#1e293b'
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-alego-500">
            Progresso (14 dias)
          </p>
          <p className="text-3xl font-bold text-alego-700">{streak} dias 🔥</p>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {lastDays.map((day) => {
          const key = day.format('YYYY-MM-DD')
          const done = studied.has(key)
          return (
            <div
              key={key}
              className={`flex h-16 flex-col items-center justify-center rounded-xl border text-xs font-semibold ${
                done
                  ? 'border-alego-500 bg-alego-50 text-alego-600'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              <span>{day.format('DD/MM')}</span>
              <span>{done ? '✔️' : '—'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ProgressCalendar

