import { CONTENT_STATUS } from './contentStatus'
import { sanitizeTopicKeyForFirestore } from './topicKeyFirestore'

export const FREE_TOPIC_COUNT = 3

export const WHATSAPP_NUMBER = '5562981841878'

export function buildWhatsAppSupportUrl(message = 'Olá! Preciso de ajuda com a plataforma ConCursos2.5.') {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

/** Gera chave estável para um tópico do edital (mesma lógica do EditalVerticalizado). */
export function makeTopicKey(topico) {
  if (!topico) return ''
  const numero = (topico.numero || '').toString().trim()
  const nome = (topico.nome || '').toString().trim()

  if (!numero && !nome) return ''
  if (!numero || !nome) {
    return encodeURIComponent(numero || nome)
  }

  return encodeURIComponent(`${numero} :: ${nome}`)
}

export function topicKeysMatch(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  try {
    const da = decodeURIComponent(a)
    const db = decodeURIComponent(b)
    if (da === db || da === b || a === db) return true
  } catch {
    /* ignore */
  }
  return sanitizeTopicKeyForFirestore(a) === sanitizeTopicKeyForFirestore(b)
}

function hashSeed(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** Coleta todas as chaves de tópicos ativos do edital. */
export function collectAllTopicKeys(edital) {
  const keys = []
  if (!edital?.disciplinas) return keys

  edital.disciplinas.forEach((disciplina) => {
    if (disciplina.ativo === false) return
    ;(disciplina.topicos || []).forEach((topico) => {
      if (topico.ativo === false) return
      const key = makeTopicKey(topico)
      if (key) keys.push(key)
    })
  })

  return keys
}

/** Seleciona N tópicos de forma determinística por usuário + curso. */
export function getFreeTopicKeys(edital, userId, courseId, count = FREE_TOPIC_COUNT) {
  if (!userId || !edital) return []

  const allKeys = collectAllTopicKeys(edital)
  if (allKeys.length === 0) return []

  const seed = `${userId}:${courseId || 'alego-default'}`
  const scored = allKeys.map((key) => ({
    key,
    score: hashSeed(`${seed}:${key}`),
  }))
  scored.sort((a, b) => a.score - b.score)

  return scored.slice(0, Math.min(count, scored.length)).map((s) => s.key)
}

export function hasPurchasedCourse(profile, courseId) {
  if (!profile) return false
  if (profile.role === 'admin') return true
  const resolvedId = courseId || 'alego-default'
  if (resolvedId === 'alego-default') return true
  if (!(profile.purchasedCourses || []).includes(resolvedId)) return false

  const access = profile.courseAccess?.[resolvedId]
  if (!access) return true // legado sem expiresAt = mantém acesso
  if (access.status === 'expired') return false
  if (access.lifetime || !access.expiresAt) return true

  const expiresAt =
    typeof access.expiresAt?.toDate === 'function'
      ? access.expiresAt.toDate()
      : new Date(access.expiresAt)
  if (Number.isNaN(expiresAt.getTime())) return true
  return expiresAt.getTime() > Date.now()
}

/**
 * Interpreta textos como "6 meses", "1 ano", "30 dias".
 * @returns {{ amount: number, unit: 'years'|'months'|'weeks'|'days' } | null}
 */
export function parseCourseDuration(input) {
  const s = String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (!s) return null

  let m = s.match(/(\d+(?:\.\d+)?)\s*(anos?|meses?|mes|dias?|semanas?)/)
  if (!m) {
    m = s.match(/^(\d+(?:\.\d+)?)$/)
    if (!m) return null
    return { amount: Number(m[1]), unit: 'months' }
  }

  const amount = Number(m[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unitRaw = m[2]
  if (unitRaw.startsWith('ano')) return { amount, unit: 'years' }
  if (unitRaw.startsWith('dia')) return { amount, unit: 'days' }
  if (unitRaw.startsWith('semana')) return { amount, unit: 'weeks' }
  return { amount, unit: 'months' }
}

/** Unidade estruturada do admin → objeto parseado */
export function resolveCourseDurationParts(courseOrDuration) {
  if (courseOrDuration && typeof courseOrDuration === 'object') {
    const unit = courseOrDuration.courseDurationUnit
    const value = Number(courseOrDuration.courseDurationValue)
    if (unit === 'lifetime' || unit === '' || unit == null) {
      if (!courseOrDuration.courseDuration) return null
    } else if (Number.isFinite(value) && value > 0 && ['days', 'months', 'years'].includes(unit)) {
      return { amount: value, unit }
    }
    return parseCourseDuration(courseOrDuration.courseDuration)
  }
  return parseCourseDuration(courseOrDuration)
}

export function formatCourseDurationLabel(amount, unit) {
  if (!amount || !unit || unit === 'lifetime') return ''
  const n = Math.floor(Number(amount))
  if (!Number.isFinite(n) || n <= 0) return ''
  if (unit === 'days') return n === 1 ? '1 dia' : `${n} dias`
  if (unit === 'years') return n === 1 ? '1 ano' : `${n} anos`
  return n === 1 ? '1 mês' : `${n} meses`
}

/** Monta o texto salvo em courseDuration a partir dos campos do admin */
export function buildCourseDurationFields({ unit, value }) {
  if (!unit || unit === 'lifetime') {
    return {
      courseDuration: '',
      courseDurationUnit: 'lifetime',
      courseDurationValue: null,
    }
  }
  const n = Math.max(1, Math.floor(Number(value) || 1))
  const safeUnit = ['days', 'months', 'years'].includes(unit) ? unit : 'months'
  return {
    courseDuration: formatCourseDurationLabel(n, safeUnit),
    courseDurationUnit: safeUnit,
    courseDurationValue: n,
  }
}

export function computeCourseExpiresAt(courseOrDuration, fromDate = new Date()) {
  const parsed = resolveCourseDurationParts(courseOrDuration)
  if (!parsed) return null
  const d = new Date(fromDate)
  if (parsed.unit === 'years') d.setFullYear(d.getFullYear() + Math.floor(parsed.amount))
  else if (parsed.unit === 'months') d.setMonth(d.getMonth() + Math.floor(parsed.amount))
  else if (parsed.unit === 'weeks') d.setDate(d.getDate() + Math.floor(parsed.amount * 7))
  else d.setDate(d.getDate() + Math.floor(parsed.amount))
  return d
}

export function isTopicPublished(publishStatus) {
  return publishStatus === CONTENT_STATUS.AVAILABLE
}

/** Aluno pode usar flash/estudar/questões deste tópico? */
export function canAccessTopicoContent({
  profile,
  courseId,
  topicKey,
  edital,
  publishStatus,
}) {
  if (!profile) return false
  if (profile.role === 'admin') return true
  if (!isTopicPublished(publishStatus)) return false
  if (hasPurchasedCourse(profile, courseId)) return true

  const freeKeys = getFreeTopicKeys(edital, profile.uid, courseId)
  return freeKeys.some((k) => topicKeysMatch(k, topicKey))
}

export function buildWhatsAppCourseUrl(courseName = '') {
  const message = encodeURIComponent(
    `Olá! Gostaria de adquirir o curso ${courseName || 'preparatório'}. Pode me ajudar?`
  )
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`
}

export function formatCoursePrice(price, fallback = 99.9) {
  const value = typeof price === 'number' && price > 0 ? price : fallback
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Texto de tempo de acesso do curso.
 * Prefere campos estruturados do admin (courseDurationValue/Unit).
 */
export function getCourseAccessLabel(courseOrDuration) {
  const parsed = resolveCourseDurationParts(courseOrDuration)
  const rawText =
    typeof courseOrDuration === 'string'
      ? courseOrDuration.trim()
      : formatCourseDurationLabel(
          courseOrDuration?.courseDurationValue,
          courseOrDuration?.courseDurationUnit,
        ) || String(courseOrDuration?.courseDuration || '').trim()

  if (parsed) {
    const short = rawText || formatCourseDurationLabel(parsed.amount, parsed.unit)
    return {
      short,
      badge: `Acesso por ${short}`,
      summary: `Acesso pelo período de ${short}. Após esse prazo o curso expira automaticamente, salvo renovação.`,
      isLifetime: false,
      canAutoRenew: true,
    }
  }

  return {
    short: 'Vitalício',
    badge: 'Acesso vitalício',
    summary:
      'Acesso vitalício ao curso, enquanto ele permanecer disponível na plataforma (ou até remoção pelo administrador).',
    isLifetime: true,
    canAutoRenew: false,
  }
}

/** Remove módulos/matérias vazios da árvore de flashcards. */
export function filterOrganizedCardsWithContent(organized) {
  const filtered = {}
  Object.entries(organized || {}).forEach(([materia, modulos]) => {
    const modsWithCards = {}
    Object.entries(modulos || {}).forEach(([modulo, cardsInMod]) => {
      if (Array.isArray(cardsInMod) && cardsInMod.length > 0) {
        modsWithCards[modulo] = cardsInMod
      }
    })
    if (Object.keys(modsWithCards).length > 0) {
      filtered[materia] = modsWithCards
    }
  })
  return filtered
}
