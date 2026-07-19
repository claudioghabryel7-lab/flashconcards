const { sanitizeQuestaoAlternativas } = require('./aiTextFormatting')

function resolveGabarito(questao = {}) {
  const raw = questao.correta || questao.respostaCorreta || questao.gabarito || ''
  return String(raw).trim().toUpperCase().replace(/[^A-E]/g, '').slice(0, 1)
}

function resolveTipoProva(banca = '', explicit = '') {
  if (explicit) return explicit
  const b = String(banca || '').toUpperCase()
  if (b.includes('CESPE') || b.includes('CEBRASPE')) return 'Certo/Errado'
  return 'ABCD'
}

function validateQuestoesPayload(parsed = {}, options = {}) {
  const errors = []
  const expectedCount = options.expectedCount ?? 50
  const tipoProva = resolveTipoProva(options.banca, options.tipoProva)
  const list = parsed?.questoes || parsed?.questions || []

  if (!Array.isArray(list) || list.length < expectedCount) {
    errors.push(`Esperado ${expectedCount} questões, recebido ${list?.length || 0}.`)
  }

  const sample = list.slice(0, expectedCount)
  sample.forEach((q, idx) => {
    if (!q || typeof q !== 'object') {
      errors.push(`Questão ${idx + 1}: objeto inválido.`)
      return
    }

    const enunciado = String(q.enunciado || q.pergunta || '').trim()
    if (enunciado.length < 10) {
      errors.push(`Questão ${idx + 1}: enunciado ausente ou muito curto.`)
    }

    const gabarito = resolveGabarito(q)
    if (!gabarito) {
      errors.push(`Questão ${idx + 1}: gabarito ausente.`)
      return
    }

    if (tipoProva === 'Certo/Errado') {
      if (!['C', 'E'].includes(gabarito)) {
        errors.push(`Questão ${idx + 1}: gabarito Certo/Errado deve ser C ou E.`)
      }
    } else {
      if (!['A', 'B', 'C', 'D', 'E'].includes(gabarito)) {
        errors.push(`Questão ${idx + 1}: gabarito "${gabarito}" inválido.`)
      }
      const alts = sanitizeQuestaoAlternativas(q.alternativas || {})
      const altText = alts[gabarito]
      if (!altText || !String(altText).trim()) {
        errors.push(`Questão ${idx + 1}: alternativa ${gabarito} vazia ou ausente.`)
      }
    }

    const explicacao = String(q.gabaritoComentado || q.explicacao || q.comentario || '').trim()
    if (explicacao.length < 15) {
      errors.push(`Questão ${idx + 1}: explicação/gabarito comentado ausente ou muito curta.`)
    }
  })

  return { ok: errors.length === 0, errors, tipoProva }
}

module.exports = {
  validateQuestoesPayload,
  resolveGabarito,
  resolveTipoProva,
}
