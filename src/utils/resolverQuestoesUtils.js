import { makeTopicKey } from './editalVerticalizadoLoader'
import { topicKeysMatch } from './courseAccess'

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
