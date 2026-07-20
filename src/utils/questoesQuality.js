/**
 * Validação leve de questões geradas — descarta itens inválidos antes de publicar.
 */
import { alternativasAsOrderedObject, normalizeQuestaoAlternativas } from './questaoAlternativas.js'

function resolveGabarito(q = {}) {
  const raw = q.correta ?? q.respostaCorreta ?? q.gabarito ?? q.resposta
  if (raw == null) return ''
  return String(raw).trim().toUpperCase().replace(/[^A-ZCE]/g, '').slice(0, 1)
}

/**
 * @returns {{ ok: object[], dropped: number }}
 */
export function filterValidQuestoes(rawList, { tipoProva = 'ABCD', minKeep = 1 } = {}) {
  const list = Array.isArray(rawList) ? rawList : []
  const ok = []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const enunciado = String(item.enunciado || item.pergunta || '').trim()
    if (enunciado.length < 20) continue

    const gabarito = resolveGabarito(item)
    if (!gabarito) continue

    if (tipoProva === 'Certo/Errado' || tipoProva === 'CE') {
      if (gabarito !== 'C' && gabarito !== 'E') continue
      ok.push({
        ...item,
        enunciado,
        correta: gabarito,
        respostaCorreta: gabarito,
        gabarito,
      })
      continue
    }

    const alts = normalizeQuestaoAlternativas(item.alternativas || item.opcoes, 5)
    if (alts.length < 2) continue
    const letters = new Set(alts.map((a) => a.letra))
    if (!letters.has(gabarito)) continue
    if (alts.some((a) => !String(a.texto || '').trim())) continue

    ok.push({
      ...item,
      enunciado,
      alternativas: alternativasAsOrderedObject(alts, 5),
      correta: gabarito,
      respostaCorreta: gabarito,
      gabarito,
    })
  }

  if (ok.length < minKeep && list.length > 0 && ok.length === 0) {
    const err = new Error('Nenhuma questão válida gerada (gabarito/alternativas).')
    err.code = 'questoes_invalid'
    throw err
  }

  return { ok, dropped: Math.max(0, list.length - ok.length) }
}
