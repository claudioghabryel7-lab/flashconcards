/**
 * Auditoria pós-geração (server) — fail-closed.
 * Segunda chamada SOMENTE quando há citações legais (custo baixo).
 */

const { textHasLegalClaims, LEGAL_CLAIM_PATTERNS } = require('./unifiedLegalTravas')

const MAX_VERIFY_CHARS = 8000

function truncateForVerification(text = '') {
  if (!text || text.length <= MAX_VERIFY_CHARS) return text

  const claims = []
  for (const pattern of LEGAL_CLAIM_PATTERNS) {
    const matches = String(text).match(pattern) || []
    claims.push(...matches)
  }

  const uniqueClaims = [...new Set(claims)].slice(0, 25)
  const head = String(text).slice(0, 4000)
  const tail = String(text).slice(-2000)

  if (uniqueClaims.length === 0) {
    return `${head}\n\n[...trecho omitido...]\n\n${tail}`.slice(0, MAX_VERIFY_CHARS)
  }

  return `${head}\n\nAFIRMAÇÕES A VERIFICAR:\n${uniqueClaims.join('\n')}\n\n${tail}`.slice(
    0,
    MAX_VERIFY_CHARS,
  )
}

function buildVerificationPrompt(content, courseContext = {}) {
  const banca = courseContext.banca || 'não definida'
  const concurso = courseContext.concursoName || courseContext.competition || courseContext.name || ''
  const hoje = new Date().toLocaleDateString('pt-BR')

  return `Você é auditor jurídico de material para concursos (${concurso}, banca ${banca}).
Data: ${hoje}. Use Google Search para confirmar vigência de leis e artigos citados.

Analise o conteúdo. Classifique afirmações jurídicas: CONFIRMADO | INCERTO | FALSO.

Responda APENAS JSON:
{
  "aprovado": true ou false,
  "problemas": [{"trecho": "...", "status": "FALSO|INCERTO", "motivo": "...", "correcao": "..."}],
  "texto_corrigido": null ou "texto/JSON corrigido completo"
}

Regras:
- aprovado=true SOMENTE se zero FALSO e no máximo 1 INCERTO leve.
- FALSO ou INCERTO grave → aprovado=false.
- Não invente leis.

CONTEÚDO:
${truncateForVerification(content)}`
}

function parseVerificationResult(rawText = '') {
  const rejected = { aprovado: false, problemas: [{ status: 'INCERTO', motivo: 'Auditoria não parseável' }], texto_corrigido: null }

  try {
    const jsonMatch = String(rawText).match(/\{[\s\S]*\}/)
    if (!jsonMatch) return rejected
    const parsed = JSON.parse(jsonMatch[0])
    const problemas = Array.isArray(parsed.problemas) ? parsed.problemas : []
    const hasFalse = problemas.some((p) => String(p?.status || '').toUpperCase() === 'FALSO')
    const graveIncerto = problemas.filter((p) => String(p?.status || '').toUpperCase() === 'INCERTO').length > 1
    const aprovado = parsed.aprovado === true && !hasFalse && !graveIncerto
    return {
      aprovado,
      problemas,
      texto_corrigido: parsed.texto_corrigido || null,
    }
  } catch {
    return rejected
  }
}

function shouldRunVerification(text = '', options = {}) {
  if (options.verifyContent === false) return false
  if (options.isLegalContent === false) return false
  return textHasLegalClaims(text)
}

module.exports = {
  buildVerificationPrompt,
  parseVerificationResult,
  shouldRunVerification,
  truncateForVerification,
}
