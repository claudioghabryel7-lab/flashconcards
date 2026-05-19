import { collection, doc, getDoc, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Chave estável do tópico (numero + nome) — igual ao Edital Verticalizado.
 */
export const makeTopicKey = (topico) => {
  if (!topico) return ''
  const numero = (topico.numero || '').toString().trim()
  const nome = (topico.nome || '').toString().trim()
  if (!numero && !nome) return ''
  if (!numero || !nome) {
    return encodeURIComponent(numero || nome)
  }
  return encodeURIComponent(`${numero} :: ${nome}`)
}

/**
 * Formata tópico do edital como nome de módulo (igual à geração de flashcards no edital).
 */
export function formatTopicoAsModulo(topico) {
  if (!topico) return 'Tópico'
  const numero = (topico.numero || '').toString().trim()
  const nome = (topico.nome || '').toString().trim()
  if (numero && nome) return `${numero} - ${nome}`
  return nome || numero || 'Tópico'
}

/**
 * Normaliza chave de módulo para comparação flexível.
 */
export function normalizeModuloKey(str) {
  if (!str) return ''
  return str
    .toString()
    .trim()
    .toLowerCase()
    .replace(/^\d+[\.\)\-\s]*/, '')
    .replace(/\s+/g, ' ')
}

/**
 * Normaliza flashcard do edital (disciplina/topico/frente/verso) para formato interno.
 */
export function normalizeFlashcard(card) {
  const materia = (card.disciplina || card.materia || '').trim()
  let modulo = (card.topico || card.modulo || '').trim()
  const topicoNumero = card.topicoNumero?.toString().trim()

  if (topicoNumero && modulo && !modulo.startsWith(topicoNumero)) {
    const nomeOnly = modulo.replace(new RegExp(`^${topicoNumero}\\s*[-–.]?\\s*`, 'i'), '').trim()
    modulo = nomeOnly ? `${topicoNumero} - ${nomeOnly}` : `${topicoNumero} - ${modulo}`
  }

  return {
    ...card,
    materia,
    modulo,
    disciplina: materia,
    topico: card.topico || card.modulo,
    pergunta: card.frente || card.pergunta || '',
    resposta: card.verso || card.resposta || '',
  }
}

/**
 * Carrega edital verticalizado completo (com partes, se houver).
 */
export async function loadEditalVerticalizado(courseId) {
  const resolvedId = courseId || 'alego-default'
  const editalRef = doc(db, 'courses', resolvedId, 'editalVerticalizado', 'principal')
  const snapshot = await getDoc(editalRef)

  if (!snapshot.exists()) return null

  const data = snapshot.data()

  if (data.temPartes && data.totalPartes > 1) {
    const partesRef = collection(
      db,
      'courses',
      resolvedId,
      'editalVerticalizado',
      'principal',
      'partes'
    )
    const partesSnapshot = await getDocs(query(partesRef, orderBy('parte')))
    const todasDisciplinas = [...(data.disciplinas || [])]

    partesSnapshot.forEach((parteDoc) => {
      const parteData = parteDoc.data()
      if (parteData.disciplinas && Array.isArray(parteData.disciplinas)) {
        todasDisciplinas.push(...parteData.disciplinas)
      }
    })

    return { ...data, disciplinas: todasDisciplinas }
  }

  return data
}

/**
 * Monta navegação matéria → módulos a partir do edital (+ módulos extras dos cards).
 */
export function buildNavigationFromEdital(edital, cards = []) {
  const modulesByMateria = {}

  if (edital?.disciplinas) {
    edital.disciplinas.forEach((disciplina) => {
      const nome = disciplina.nome?.trim()
      if (!nome) return
      if (disciplina.ativo === false) return

      modulesByMateria[nome] = (disciplina.topicos || [])
        .filter((t) => t.ativo !== false)
        .map((t) => formatTopicoAsModulo(t))
    })
  }

  cards.forEach((raw) => {
    const card = normalizeFlashcard(raw)
    if (!card.materia) return
    if (!modulesByMateria[card.materia]) {
      modulesByMateria[card.materia] = []
    }
    if (card.modulo) {
      const exists = modulesByMateria[card.materia].some(
        (m) => normalizeModuloKey(m) === normalizeModuloKey(card.modulo)
      )
      if (!exists) {
        modulesByMateria[card.materia].push(card.modulo)
      }
    }
  })

  return modulesByMateria
}

/**
 * Organiza cards por matéria/módulo; estrutura vem do edital quando disponível.
 */
export function buildOrganizedCardsFromEdital(edital, cards = []) {
  const organized = {}
  const normalizedCards = cards.map(normalizeFlashcard)

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

  const findModuloKey = (materiaMap, cardModulo) => {
    if (materiaMap[cardModulo]) return cardModulo
    const norm = normalizeModuloKey(cardModulo)
    return (
      Object.keys(materiaMap).find((k) => normalizeModuloKey(k) === norm) || cardModulo
    )
  }

  normalizedCards.forEach((card) => {
    const { materia, modulo } = card
    if (!materia || !modulo) return
    if (!organized[materia]) organized[materia] = {}
    const key = findModuloKey(organized[materia], modulo)
    if (!organized[materia][key]) organized[materia][key] = []
    if (!organized[materia][key].some((c) => c.id === card.id)) {
      organized[materia][key].push(card)
    }
  })

  return organized
}

/**
 * Verifica se o card pertence à matéria/módulo selecionados.
 */
export function cardMatchesModule(card, materia, modulo) {
  const c = normalizeFlashcard(card)
  if (c.materia?.trim().toLowerCase() !== materia?.trim().toLowerCase()) {
    const partial =
      c.materia?.toLowerCase().includes(materia?.toLowerCase()) ||
      materia?.toLowerCase().includes(c.materia?.toLowerCase())
    if (!partial) return false
  }
  if (c.modulo === modulo) return true
  return normalizeModuloKey(c.modulo) === normalizeModuloKey(modulo)
}

/**
 * Conta flashcards em um módulo.
 */
export function countCardsInModule(cards, materia, modulo) {
  return cards.filter((c) => cardMatchesModule(c, materia, modulo)).length
}

/**
 * Extrai contexto do tópico no edital para prompts de IA.
 */
export function getTopicoContextFromEdital(edital, materia, modulo) {
  if (!edital?.disciplinas) return null

  const materiaNorm = materia?.trim().toLowerCase()
  const moduloNorm = normalizeModuloKey(modulo)

  for (const disciplina of edital.disciplinas) {
    if (disciplina.nome?.trim().toLowerCase() !== materiaNorm) {
      const partial =
        disciplina.nome?.toLowerCase().includes(materiaNorm) ||
        materiaNorm?.includes(disciplina.nome?.toLowerCase())
      if (!partial) continue
    }

    for (const topico of disciplina.topicos || []) {
      const label = formatTopicoAsModulo(topico)
      if (
        label === modulo ||
        normalizeModuloKey(label) === moduloNorm ||
        topico.nome?.trim().toLowerCase() === moduloNorm
      ) {
        return {
          disciplina: disciplina.nome,
          topico: topico.nome,
          topicoNumero: topico.numero || '',
          descricao: topico.descricao || '',
          conteudo: topico.conteudo || '',
        }
      }
    }
  }

  return null
}

/**
 * Texto resumido do edital verticalizado para prompts.
 */
export function buildEditalStructurePrompt(edital, maxDisciplinas = 30) {
  if (!edital?.disciplinas?.length) return ''

  const linhas = edital.disciplinas.slice(0, maxDisciplinas).map((d) => {
    const topicos = (d.topicos || [])
      .slice(0, 20)
      .map((t) => formatTopicoAsModulo(t))
      .join('; ')
    return `- ${d.nome}: ${topicos || '(sem tópicos)'}`
  })

  return `ESTRUTURA DO EDITAL VERTICALIZADO:\n${linhas.join('\n')}`
}
