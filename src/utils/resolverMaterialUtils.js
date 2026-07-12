import { formatTopicoAsModulo, normalizeModuloKey, makeTopicKey } from './editalVerticalizadoLoader'
import { topicKeysMatch, isTopicPublished, canAccessTopicoContent } from './courseAccess'
import { CONTENT_STATUS } from './contentStatus'
import { resolveTopicPublishStatus } from '../services/topicoPublishService'
import { normalizeTopicKeyForStorage } from './topicKeyFirestore'

export function isMaterialAccessible({
  doc,
  profile,
  courseId,
  topicKey,
  edital,
  publishMap,
  isAdmin,
}) {
  if (isAdmin) return true
  if (!topicKey) return false

  const publishStatus = resolveTopicPublishStatus(publishMap, topicKey)
  const topicoPublished = isTopicPublished(publishStatus)
  const docPublished =
    doc?.status === CONTENT_STATUS.AVAILABLE || doc?.status === 'disponivel'

  if (!topicoPublished && !docPublished) return false

  return canAccessTopicoContent({
    profile,
    courseId,
    topicKey,
    edital,
    publishStatus: topicoPublished ? publishStatus : CONTENT_STATUS.AVAILABLE,
  })
}

export function buildOrganizedMaterialFromEdital(edital, items = []) {
  const organized = {}

  if (edital?.disciplinas) {
    edital.disciplinas.forEach((disciplina) => {
      const materia = disciplina.nome?.trim()
      if (!materia || disciplina.ativo === false) return
      organized[materia] = {}
      ;(disciplina.topicos || []).forEach((topico) => {
        if (topico.ativo === false) return
        const modulo = formatTopicoAsModulo(topico)
        organized[materia][modulo] = []
      })
    })
  }

  const findMateriaKey = (organizedRoot, itemMateria) => {
    if (organizedRoot[itemMateria]) return itemMateria
    const norm = itemMateria.trim().toLowerCase()
    const match = Object.keys(organizedRoot).find((k) => {
      const kn = k.trim().toLowerCase()
      return kn === norm || kn.includes(norm) || norm.includes(kn)
    })
    return match || itemMateria
  }

  const findModuloKey = (materiaMap, itemModulo) => {
    if (materiaMap[itemModulo]) return itemModulo
    const norm = normalizeModuloKey(itemModulo)
    return (
      Object.keys(materiaMap).find((k) => normalizeModuloKey(k) === norm) || itemModulo
    )
  }

  items.forEach((item) => {
    const materia = item.materia || 'Geral'
    const modulo = item.modulo || item.topicoNome || 'Outros'
    if (!materia || !modulo) return

    const materiaKey = findMateriaKey(organized, materia)
    if (!organized[materiaKey]) organized[materiaKey] = {}
    const moduloKey = findModuloKey(organized[materiaKey], modulo)
    if (!organized[materiaKey][moduloKey]) organized[materiaKey][moduloKey] = []
    organized[materiaKey][moduloKey].push(item)
  })

  return organized
}

export function filterOrganizedMaterialWithContent(organized = {}) {
  const filtered = {}
  Object.entries(organized).forEach(([materia, modulos]) => {
    const modsWithContent = {}
    Object.entries(modulos || {}).forEach(([modulo, entries]) => {
      if (Array.isArray(entries) && entries.length > 0) {
        modsWithContent[modulo] = entries
      }
    })
    if (Object.keys(modsWithContent).length > 0) {
      filtered[materia] = modsWithContent
    }
  })
  return filtered
}

export function materialDocToItem(docId, data, edital) {
  const topicKey = normalizeTopicKeyForStorage(data.topicKey || data.numero || docId)
  let materia = data.materia || data.disciplina || ''
  let topicoNome = data.titulo || data.materia || topicKey

  if (edital?.disciplinas) {
    for (const disciplina of edital.disciplinas) {
      const topico = (disciplina.topicos || []).find((t) => {
        const key = makeTopicKey(t)
        return topicKeysMatch(key, topicKey)
      })
      if (topico) {
        materia = disciplina.nome || materia
        topicoNome = topico.nome || topicoNome
        break
      }
    }
  }

  return {
    id: docId,
    topicKey,
    topicoNome,
    materia: materia || 'Geral',
    modulo: topicoNome,
    titulo: data.titulo || data.materia || topicoNome,
  }
}
