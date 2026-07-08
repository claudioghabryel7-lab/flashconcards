export const MODALITY_LABELS = {
  teoria: 'Teoria',
  questoes: 'Questões',
  flashcards: 'FlashCards',
  revisao: 'Revisão',
  exercicios: 'Exercícios',
  'lei-seca': 'Lei seca',
}

const PATTERN_DOTS =
  'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'2\' cy=\'2\' r=\'1.5\' fill=\'white\' fill-opacity=\'0.12\'/%3E%3C/svg%3E")'

const PATTERN_GRID =
  'url("data:image/svg+xml,%3Csvg width=\'24\' height=\'24\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M24 0H0v24\' fill=\'none\' stroke=\'white\' stroke-opacity=\'0.08\'/%3E%3C/svg%3E")'

const PATTERN_WAVES =
  'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'30\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 15 Q15 0 30 15 T60 15\' fill=\'none\' stroke=\'white\' stroke-opacity=\'0.1\' stroke-width=\'2\'/%3E%3C/svg%3E")'

const PATTERN_DIAMONDS =
  'url("data:image/svg+xml,%3Csvg width=\'28\' height=\'28\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M14 0 L28 14 L14 28 L0 14 Z\' fill=\'none\' stroke=\'white\' stroke-opacity=\'0.09\'/%3E%3C/svg%3E")'

const PATTERN_BOOKS =
  'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect x=\'8\' y=\'6\' width=\'10\' height=\'28\' rx=\'1\' fill=\'white\' fill-opacity=\'0.06\'/%3E%3Crect x=\'22\' y=\'10\' width=\'10\' height=\'24\' rx=\'1\' fill=\'white\' fill-opacity=\'0.04\'/%3E%3C/svg%3E")'

export const CARD_COLOR_THEMES = {
  violet: {
    label: 'Roxo',
    background: 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 45%, #1e1b4b 100%)',
    pattern: PATTERN_DOTS,
  },
  amber: {
    label: 'Laranja',
    background: 'linear-gradient(135deg, #d97706 0%, #f97316 50%, #be123c 100%)',
    pattern: PATTERN_WAVES,
  },
  emerald: {
    label: 'Verde',
    background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #134e4a 100%)',
    pattern: PATTERN_GRID,
  },
  slate: {
    label: 'Azul',
    background: 'linear-gradient(135deg, #475569 0%, #4338ca 50%, #1e3a8a 100%)',
    pattern: PATTERN_DIAMONDS,
  },
  rose: {
    label: 'Rosa',
    background: 'linear-gradient(135deg, #e11d48 0%, #db2777 50%, #86198f 100%)',
    pattern: PATTERN_DOTS,
  },
  cyan: {
    label: 'Ciano',
    background: 'linear-gradient(135deg, #0891b2 0%, #0ea5e9 50%, #1d4ed8 100%)',
    pattern: PATTERN_WAVES,
  },
  midnight: {
    label: 'Noturno',
    background: 'linear-gradient(135deg, #27272a 0%, #0f172a 60%, #000000 100%)',
    pattern: PATTERN_BOOKS,
  },
}

export const CARD_FONT_STYLES = {
  display: { label: 'Syne', titleClass: 'font-display', bodyClass: 'font-sans' },
  sans: { label: 'Padrão', titleClass: 'font-sans', bodyClass: 'font-sans' },
  mono: { label: 'Mono', titleClass: 'font-mono', bodyClass: 'font-mono' },
}

const MODALITY_DEFAULT_COLOR = {
  teoria: 'violet',
  questoes: 'amber',
  flashcards: 'emerald',
  revisao: 'amber',
  exercicios: 'amber',
  'lei-seca': 'slate',
}

export function resolveCardTheme(post) {
  const color = post?.cardTheme?.color
  if (color && CARD_COLOR_THEMES[color]) return CARD_COLOR_THEMES[color]
  const fromModality = MODALITY_DEFAULT_COLOR[post?.modalidade]
  if (fromModality && CARD_COLOR_THEMES[fromModality]) return CARD_COLOR_THEMES[fromModality]
  return CARD_COLOR_THEMES.violet
}

/** @deprecated use resolveCardTheme */
export function resolveCardGradient(post) {
  return resolveCardTheme(post).background
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

export const FEED_POST_TYPES = {
  TRILHA: 'trilha',
  FLASHCARDS: 'flashcards',
  QUESTOES: 'questoes',
  MATERIAL: 'material',
  COMENTARIO: 'comentario',
}

export const POST_TYPE_LABELS = {
  trilha: 'Sessão de estudo',
  flashcards: 'FlashCards',
  questoes: 'Questões',
  material: 'Material do tópico',
  comentario: 'Comentário',
}

export function resolvePostType(post) {
  return post?.postType || FEED_POST_TYPES.TRILHA
}

export function resolveContentQuestionText(post) {
  return (
    post?.contentPreview ||
    post?.itemPreview?.enunciado ||
    post?.itemPreview?.pergunta ||
    post?.itemPreview?.text ||
    ''
  )
}

export function resolveShareQuestionText(post) {
  return resolveContentQuestionText(post)
}

export function getPostCaption(post) {
  const type = resolvePostType(post)
  const materia = post.materia || 'matéria'
  const assunto = post.assunto ? ` — ${post.assunto}` : ''

  switch (type) {
    case FEED_POST_TYPES.FLASHCARDS:
      return {
        verb: 'compartilhou um flashcard de',
        materia,
        assunto,
        meta: post.itemPreview ? '1 card' : post.itemCount ? `${post.itemCount} cards` : null,
      }
    case FEED_POST_TYPES.QUESTOES:
      return {
        verb: 'compartilhou uma questão de',
        materia,
        assunto,
        meta: post.itemPreview ? '1 questão' : post.itemCount ? `${post.itemCount} questões` : null,
      }
    case FEED_POST_TYPES.MATERIAL:
      return { verb: 'compartilhou material de', materia, assunto, meta: 'Material de apoio' }
    case FEED_POST_TYPES.COMENTARIO:
      return {
        isCommentPost: true,
        questionText: resolveContentQuestionText(post),
        commentText: post.commentText || '',
        materia,
        assunto,
      }
    default:
      return {
        verb: 'estudou',
        materia,
        assunto,
        meta: `${MODALITY_LABELS[post.modalidade] || post.modalidade || 'Teoria'} · ${post.durationMinutes || 0} min`,
      }
  }
}

export function getPostOpenUrl(post, origin = '') {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  if (post.shareUrl) {
    return post.shareUrl.startsWith('http') ? post.shareUrl : `${base}${post.shareUrl}`
  }
  const type = resolvePostType(post)
  if (type === FEED_POST_TYPES.COMENTARIO) {
    return buildContentCommentShareUrl(post, base)
  }
  if (type === FEED_POST_TYPES.FLASHCARDS && post.shareToken) {
    return `${base}/share-flashcards/${post.shareToken}`
  }
  if (type === FEED_POST_TYPES.QUESTOES && post.shareId) {
    return `${base}/share-questao/${post.shareId}`
  }
  if (type === FEED_POST_TYPES.MATERIAL && post.courseId && post.topicKey) {
    const nome = post.assunto ? `?nome=${encodeURIComponent(post.assunto)}` : ''
    return `${base}/conteudo-completo/topic/${post.courseId}/${post.topicKey}${nome}`
  }
  return `${base}/comunidade/publicacao/${post.id}`
}

export function buildContentCommentSharePath({ courseId, contentType, topicKey }) {
  if (!courseId) return '/comunidade'
  if (contentType === 'questao' && topicKey) {
    if (String(topicKey).startsWith('incidencia_')) {
      const idx = String(topicKey).replace('incidencia_', '')
      return `/pratica-incidencia/${courseId}/${idx}`
    }
    return `/questoes-topic/${courseId}/${encodeURIComponent(topicKey)}`
  }
  if (contentType === 'flashcard' && topicKey) {
    return `/flashcards/topico/${courseId}?topicKey=${encodeURIComponent(topicKey)}`
  }
  if (contentType === 'incidencia' && courseId) {
    const idx = topicKey?.replace?.(/^d/, '') || topicKey
    if (idx != null && idx !== '') {
      return `/conteudo-incidencia/${courseId}/${idx}`
    }
  }
  return '/comunidade'
}

export function buildContentCommentShareUrl(
  { courseId, contentType, topicKey, shareUrl },
  origin = '',
) {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  const path = shareUrl || buildContentCommentSharePath({ courseId, contentType, topicKey })
  return path.startsWith('http') ? path : `${base}${path}`
}

export const MODALITY_GRADIENT_CLASS = {
  teoria: 'bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-900',
  revisao: 'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600',
  exercicios: 'bg-gradient-to-br from-emerald-500 via-green-600 to-teal-800',
  'lei-seca': 'bg-gradient-to-br from-slate-600 via-indigo-700 to-blue-900',
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
