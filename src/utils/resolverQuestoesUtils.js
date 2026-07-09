import { makeTopicKey } from './editalVerticalizadoLoader'
import { normalizeTopicKeyForStorage } from './topicKeyFirestore'
import { topicKeysMatch, isTopicPublished, canAccessTopicoContent } from './courseAccess'
import { CONTENT_STATUS } from './contentStatus'
import { resolveTopicPublishStatus } from '../services/topicoPublishService'

export function normalizeMateriaLabel(name = '') {
  if (!name?.trim()) return 'Geral'
  return name.trim().replace(/\s+/g, ' ')
}

export function formatModuloLabel(ctx, pack) {
  if (ctx?.topico) {
    const nome = String(ctx.topico).trim()
    const numero = String(ctx.topicoNumero || '').trim()
    if (numero && (nome.startsWith(`${numero} -`) || nome.startsWith(`${numero}.`))) {
      return nome
    }
    if (numero) return `${numero} - ${nome}`
    return nome
  }

  const raw = pack?.topico || 'Tópico'
  try {
    const decoded = decodeURIComponent(String(raw))
    if (decoded.includes(' :: ')) {
      const [num, ...rest] = decoded.split(' :: ')
      const nome = rest.join(' :: ').trim()
      return nome ? `${num} - ${nome}` : decoded
    }
    return decoded
  } catch {
    return raw
  }
}

export function dedupeTopicoPacks(packs = []) {
  const byKey = new Map()

  packs.forEach((pack) => {
    const topicKey = normalizeTopicKeyForStorage(pack.topicKey || pack.topico || pack.id)
    const nivelMatch = pack.id?.match(/_nivel_(\d+)$/)
    const nivel = pack.nivel || (nivelMatch ? parseInt(nivelMatch[1], 10) : 1)
    const key = `${topicKey}::${nivel}`

    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, pack)
      return
    }

    const existingHasNivel = /_nivel_\d+$/.test(existing.id || '')
    const candidateHasNivel = /_nivel_\d+$/.test(pack.id || '')
    const count = (p) => (Array.isArray(p.questoes) ? p.questoes.length : 0)

    if (candidateHasNivel && !existingHasNivel) {
      byKey.set(key, pack)
    } else if (!candidateHasNivel && existingHasNivel) {
      // keep existing
    } else if (count(pack) > count(existing)) {
      byKey.set(key, pack)
    }
  })

  return [...byKey.values()]
}

export function isPackAccessible({ pack, profile, courseId, topicKey, edital, publishMap, isAdmin }) {
  if (isAdmin) return true

  const packPublished = pack.status === CONTENT_STATUS.AVAILABLE || pack.status === 'disponivel'
  if (packPublished) return true

  if (!topicKey) return false

  const publishStatus = resolveTopicPublishStatus(publishMap, topicKey)
  if (!isTopicPublished(publishStatus)) return false

  return canAccessTopicoContent({ profile, courseId, topicKey, edital, publishStatus })
}

export function extractContextFromEdital(editalData, topicoKey) {
  if (!editalData?.disciplinas || !topicoKey) return null

  for (const disciplina of editalData.disciplinas) {
    if (!disciplina.topicos) continue

    const topico = disciplina.topicos.find((t) => {
      const key = makeTopicKey(t)
      return (
        topicKeysMatch(key, topicoKey) ||
        t.nome === topicoKey ||
        t.numero === topicoKey
      )
    })

    if (topico) {
      return {
        disciplina: disciplina.nome || 'Disciplina',
        topico: topico.nome || topico.numero || 'Tópico',
        topicoNumero: topico.numero || '',
      }
    }
  }

  return null
}

export function flattenQuestoesFromPack(pack, meta) {
  const questoes = Array.isArray(pack?.questoes) ? pack.questoes : []
  return questoes.map((questao, index) => ({
    id: `${meta.packId}_${index}`,
    questao,
    materia: meta.materia,
    modulo: meta.modulo,
    topicKey: meta.topicKey || null,
    tipoProva: pack.tipoProva || 'ABCD',
    source: meta.source,
    packId: meta.packId,
    nivel: meta.nivel,
  }))
}

export function organizeQuestoesByMateria(items = []) {
  const organized = {}
  items.forEach((item) => {
    if (!organized[item.materia]) organized[item.materia] = {}
    if (!organized[item.materia][item.modulo]) organized[item.materia][item.modulo] = []
    organized[item.materia][item.modulo].push(item)
  })
  return organized
}

export function filterOrganizedQuestoesWithContent(organized = {}) {
  const filtered = {}
  Object.entries(organized).forEach(([materia, modulos]) => {
    const modsWithQuestoes = {}
    Object.entries(modulos || {}).forEach(([modulo, questoes]) => {
      if (Array.isArray(questoes) && questoes.length > 0) {
        modsWithQuestoes[modulo] = questoes
      }
    })
    if (Object.keys(modsWithQuestoes).length > 0) {
      filtered[materia] = modsWithQuestoes
    }
  })
  return filtered
}

export function statsToChartData(byMateria = {}, field = 'correct') {
  return Object.entries(byMateria)
    .map(([name, data]) => ({
      name,
      value: field === 'correct' ? data?.correct || 0 : data?.wrong || 0,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
}
