/** Travas jurídicas compartilhadas — mesma base para flashcards, material e questões. */

function todayPtBr() {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function buildUnifiedLegalTravas({ banca = '', concursoName = '' } = {}) {
  const hoje = todayPtBr()
  return `
🚨 FIDELIDADE JURÍDICA (OBRIGATÓRIO — data de referência: ${hoje})
BANCA: ${banca || 'não definida'} | CONCURSO/CARGO: ${concursoName || 'não informado'}

1. PROIBIDO inventar números de leis, decretos, artigos, súmulas ou datas.
2. Se não tiver certeza absoluta após consultar fontes: cite o conceito SEM número inventado OU omita a citação numérica.
3. Códigos pré-1988: verifique recepção pela CF/88; não cite como vigente o declarado inconstitucional/não recepcionado.
4. Confronte jurisprudência pacífica (STF/STJ) quando a eficácia do dispositivo foi alterada por decisão definitiva.
5. USE Google Search / contexto de busca para confirmar vigência ANTES de citar lei ou artigo.
6. Gabarito e explicação devem estar SEMPRE alinhados.

PROCESSO INTERNO (não exibir): confira cada citação legal; se não confirmar, remova ou generalize — nunca invente.`
}

function isLikelyLegalDiscipline(disciplina = '') {
  const n = String(disciplina || '').toLowerCase()
  return /direito|constitucional|penal|administrativ|processual|tribut|legisla|juríd|juridic|cf\/88|\bc\.?\s*c\.?|\bc\.?\s*p\.?|\bcpc\b|\bcpp\b|\bclt\b|emprego público|servidor/.test(
    n,
  )
}

const LEGAL_CLAIM_PATTERNS = [
  /lei\s+n[º°.]?\s*[\d.]+(?:\/\d{2,4})?/gi,
  /art(?:igo)?\.?\s*\d+/gi,
  /súmula\s+\d+/gi,
  /sumula\s+\d+/gi,
  /adi\s+\d+/gi,
  /stf|stj|tema\s+\d+/gi,
  /cf\/88|constituição federal/gi,
  /vigente|revogad|vetad|inconstitucional/gi,
]

function textHasLegalClaims(text = '') {
  const sample = String(text || '')
  if (sample.length < 20) return false
  return LEGAL_CLAIM_PATTERNS.some((p) => {
    const re = new RegExp(p.source, p.flags)
    return re.test(sample)
  })
}

module.exports = {
  buildUnifiedLegalTravas,
  isLikelyLegalDiscipline,
  textHasLegalClaims,
  LEGAL_CLAIM_PATTERNS,
}
