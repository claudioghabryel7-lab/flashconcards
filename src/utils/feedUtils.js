export const MODALITY_LABELS = {
  teoria: 'Teoria',
  revisao: 'Revisão',
  exercicios: 'Exercícios',
  'lei-seca': 'Lei seca',
}

export const CARD_COLOR_THEMES = {
  violet: {
    label: 'Roxo',
    class: 'bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-900',
  },
  amber: {
    label: 'Laranja',
    class: 'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600',
  },
  emerald: {
    label: 'Verde',
    class: 'bg-gradient-to-br from-emerald-500 via-green-600 to-teal-800',
  },
  slate: {
    label: 'Azul',
    class: 'bg-gradient-to-br from-slate-600 via-indigo-700 to-blue-900',
  },
  rose: {
    label: 'Rosa',
    class: 'bg-gradient-to-br from-rose-500 via-pink-600 to-fuchsia-800',
  },
  cyan: {
    label: 'Ciano',
    class: 'bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-800',
  },
  midnight: {
    label: 'Noturno',
    class: 'bg-gradient-to-br from-zinc-800 via-slate-900 to-black',
  },
}

export const CARD_FONT_STYLES = {
  display: {
    label: 'Syne',
    titleClass: 'font-display',
    bodyClass: 'font-sans',
  },
  sans: {
    label: 'Padrão',
    titleClass: 'font-sans',
    bodyClass: 'font-sans',
  },
  mono: {
    label: 'Mono',
    titleClass: 'font-mono',
    bodyClass: 'font-mono',
  },
}

const MODALITY_DEFAULT_COLOR = {
  teoria: 'violet',
  revisao: 'amber',
  exercicios: 'emerald',
  'lei-seca': 'slate',
}

export function resolveCardGradient(post) {
  const color = post?.cardTheme?.color
  if (color && CARD_COLOR_THEMES[color]) return CARD_COLOR_THEMES[color].class
  const fromModality = MODALITY_DEFAULT_COLOR[post?.modalidade]
  if (fromModality && CARD_COLOR_THEMES[fromModality]) {
    return CARD_COLOR_THEMES[fromModality].class
  }
  return MODALITY_GRADIENT_CLASS.teoria
}

export function resolveCardFonts(post) {
  const font = post?.cardTheme?.font
  if (font && CARD_FONT_STYLES[font]) return CARD_FONT_STYLES[font]
  return CARD_FONT_STYLES.display
}

export function getDefaultCardTheme(modalidade) {
  return {
    color: MODALITY_DEFAULT_COLOR[modalidade] || 'violet',
    font: 'display',
  }
}

export const MODALITY_GRADIENT_CLASS = {
  teoria: 'bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-900',
  revisao: 'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600',
  exercicios: 'bg-gradient-to-br from-emerald-500 via-green-600 to-teal-800',
  'lei-seca': 'bg-gradient-to-br from-slate-600 via-indigo-700 to-blue-900',
}

/** @deprecated use MODALITY_GRADIENT_CLASS */
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
