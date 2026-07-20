/**
 * Validação leve de questões geradas — descarta itens inválidos antes de publicar.
 */
import { alternativasAsOrderedObject, normalizeQuestaoAlternativas } from './questaoAlternativas.js'

function resolveGabarito(q = {}, alternativas = []) {
  let raw =
    q.correta ??
    q.respostaCorreta ??
    q.gabarito ??
    q.resposta ??
    q.alternativaCorreta ??
    q.correctAnswer ??
    q.answer ??
    q.answerKey ??
    q.letraCorreta
  if (raw == null || raw === '') {
    // índice 0–4 → A–E
    const idx = q.indiceCorreta ?? q.indexCorreta ?? q.correctIndex
    if (typeof idx === 'number' && idx >= 0 && idx <= 4) {
      return String.fromCharCode(65 + idx)
    }
    return ''
  }
  if (typeof raw === 'number' && raw >= 0 && raw <= 4) {
    return String.fromCharCode(65 + raw)
  }
  const s = String(raw).trim().toUpperCase()

  if (/^(CERTO|CORRETA?|VERDADEIRO|V|TRUE)$/i.test(s)) return 'C'
  if (/^(ERRADO|INCORRETA?|FALSO|F|FALSE)$/i.test(s)) return 'E'

  // "Alternativa A", "A)", "a.", "letra B"
  const letter = s.match(/\b([A-E])\b/)
  if (letter) return letter[1]

  // Gabarito veio como texto completo da alternativa
  if (alternativas.length && s.length > 1) {
    const match = alternativas.find(
      (a) => String(a.texto || '').trim().toUpperCase() === s,
    )
    if (match?.letra) return match.letra
  }

  return s.replace(/[^A-ZCE]/g, '').slice(0, 1)
}

/**
 * Normaliza lista cru (array ou objeto numerado) para array.
 */
function coerceQuestoesList(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.questoes)) return raw.questoes
    if (Array.isArray(raw.questions)) return raw.questions
    const vals = Object.values(raw).filter((v) => v && typeof v === 'object' && (v.enunciado || v.pergunta))
    if (vals.length) return vals
  }
  return []
}

/**
 * @returns {{ ok: object[], dropped: number }}
 */
export function filterValidQuestoes(rawList, { tipoProva = 'ABCD', minKeep = 1 } = {}) {
  const list = coerceQuestoesList(rawList)
  const ok = []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const enunciado = String(item.enunciado || item.pergunta || item.texto || '').trim()
    if (enunciado.length < 12) continue

    if (tipoProva === 'Certo/Errado' || tipoProva === 'CE') {
      const gabarito = resolveGabarito(item)
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

    const alts = normalizeQuestaoAlternativas(item.alternativas || item.opcoes || item.opções, 5)
    const gabarito = resolveGabarito(item, alts)

    // Se a IA misturou CE em prova ABCD, ainda aceita C/E
    if ((gabarito === 'C' || gabarito === 'E') && alts.length < 2) {
      ok.push({
        ...item,
        enunciado,
        correta: gabarito,
        respostaCorreta: gabarito,
        gabarito,
        tipo: 'certo_errado',
      })
      continue
    }

    if (!gabarito) continue
    if (alts.length < 2) continue
    const letters = new Set(alts.map((a) => a.letra))
    if (!letters.has(gabarito)) continue
    // Aceita alternativa com texto curto (leis/artigos)
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

  if (minKeep > 0 && list.length > 0 && ok.length === 0) {
    const err = new Error('Nenhuma questão válida gerada (gabarito/alternativas).')
    err.code = 'questoes_invalid'
    throw err
  }

  return { ok, dropped: Math.max(0, list.length - ok.length) }
}
