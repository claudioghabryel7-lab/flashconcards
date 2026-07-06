export const MODALITY_LABELS = {
  teoria: 'Teoria',
  revisao: 'Revisão',
  exercicios: 'Exercícios',
  'lei-seca': 'Lei seca',
}

export const MODALITY_GRADIENTS = {
  teoria: 'from-violet-600 via-purple-600 to-indigo-900',
  revisao: 'from-amber-500 via-orange-500 to-rose-600',
  exercicios: 'from-emerald-500 via-green-600 to-teal-800',
  'lei-seca': 'from-slate-600 via-indigo-700 to-blue-900',
}

export function formatFeedTime(ts) {
  if (!ts) return ''
  const date = ts?.toDate?.() || (ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts))
  if (Number.isNaN(date.getTime())) return ''

  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} d`
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

export function formatCommentTime(iso) {
  if (!iso) return ''
  return formatFeedTime(iso)
}
