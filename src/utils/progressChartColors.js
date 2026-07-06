export const CHART_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#6366F1',
  '#84CC16',
  '#06B6D4',
  '#A855F7',
]

export function assignChartColors(items = []) {
  return items.map((item, index) => ({
    ...item,
    color: item.color || CHART_COLORS[index % CHART_COLORS.length],
  }))
}

export function toChartItems(record = {}, valueKey = 'value') {
  return Object.entries(record)
    .map(([name, raw]) => {
      const value = typeof raw === 'number' ? raw : raw?.[valueKey] ?? raw?.value ?? 0
      return { name, value: Number(value) || 0 }
    })
    .filter((item) => item.value > 0)
}
