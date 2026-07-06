import { CONTENT_STATUS } from './contentStatus'
import { sanitizeTopicKeyForFirestore } from './topicKeyFirestore'

export const FREE_TOPIC_COUNT = 3

const WHATSAPP_NUMBER = '5562981841878'

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
  return (profile.purchasedCourses || []).includes(resolvedId)
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
