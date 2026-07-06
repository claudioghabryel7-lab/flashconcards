import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function formatDefault(value, unit) {
  if (unit === 'h') {
    return value < 1 ? `${Math.round(value * 60)}min` : `${value.toFixed(1)}h`
  }
  return `${Math.round(value)}`
}

function ChartTooltip({ active, payload, unit, formatValue }) {
  if (!active || !payload?.[0]) return null
  const item = payload[0].payload
  const formatted = formatValue
    ? formatValue(item.value)
    : formatDefault(item.value, unit)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{formatted}</p>
    </div>
  )
}

function SimpleChart({ data, unit, formatValue, maxItems = 8 }) {
  const visible = data.slice(0, maxItems)
  const maxValue = Math.max(...visible.map((item) => item.value), 1)

  return (
    <div className="space-y-2">
      {visible.map((item) => {
        const formatted = formatValue
          ? formatValue(item.value)
          : formatDefault(item.value, unit)
        const width = `${Math.max(8, (item.value / maxValue) * 100)}%`

        return (
          <div key={item.name} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate font-medium text-slate-900 dark:text-white">
                  {item.name}
                </span>
              </div>
              <span className="shrink-0 font-semibold text-slate-700 dark:text-slate-200">
                {formatted}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                className="h-2 rounded-full transition-all"
                style={{ width, backgroundColor: item.color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SubjectMetricChart({
  title,
  data = [],
  chartType = 'pie',
  unit = '',
  emptyMessage = 'Nenhum dado disponível ainda.',
  formatValue,
}) {
  if (!data.length) {
    return (
      <div className="rounded-xl border border-cp-border bg-cp-surface/50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-cp-text">{title}</h3>
        <p className="text-sm text-cp-muted">{emptyMessage}</p>
      </div>
    )
  }

  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="rounded-xl border border-cp-border bg-cp-surface/30 p-4">
      <h3 className="mb-4 text-sm font-semibold text-cp-text">{title}</h3>

      {chartType === 'simple' ? (
        <SimpleChart data={data} unit={unit} formatValue={formatValue} />
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={unit === 'h'} />
                <Tooltip content={<ChartTooltip unit={unit} formatValue={formatValue} />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={88}
                  label={({ name, percent }) =>
                    percent >= 0.08 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''
                  }
                  labelLine={false}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip unit={unit} formatValue={formatValue} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {data.slice(0, 6).map((item) => {
          const formatted = formatValue
            ? formatValue(item.value)
            : formatDefault(item.value, unit)
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0

          return (
            <span
              key={item.name}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="max-w-[120px] truncate">{item.name}</span>
              <span className="font-semibold">{formatted}</span>
              {chartType !== 'simple' && <span className="text-slate-500">({pct}%)</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}
