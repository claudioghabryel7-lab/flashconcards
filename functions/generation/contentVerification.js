/**
 * Auditoria pós-geração (server) — fail-closed.
 */

const { textHasLegalClaims, LEGAL_CLAIM_PATTERNS, isLikelyLegalDiscipline } = require('./unifiedLegalTravas')

const MAX_VERIFY_CHARS = 12000
const FLASHCARD_VERIFY_CHARS = 10000

function truncateForVerification(text = '', maxChars = MAX_VERIFY_CHARS) {
  if (!text || text.length <= maxChars) return text

  const claims = []
  for (const pattern of LEGAL_CLAIM_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags)
    const matches = String(text).match(re) || []
    claims.push(...matches)
  }

  const uniqueClaims = [...new Set(claims)].slice(0, 30)
  const head = String(text).slice(0, Math.floor(maxChars * 0.55))
  const tail = String(text).slice(-Math.floor(maxChars * 0.3))

  if (uniqueClaims.length === 0) {
    return `${head}\n\n[...trecho omitido...]\n\n${tail}`.slice(0, maxChars)
  }

  return `${head}\n\nAFIRMAÇÕES A VERIFICAR:\n${uniqueClaims.join('\n')}\n\n${tail}`.slice(
    0,
    maxChars,
  )
}

function buildVerificationPrompt(content, courseContext = {}) {
  const banca = courseContext.banca || 'não definida'
  const concurso = courseContext.concursoName || courseContext.cargo || courseContext.competition || ''
  const disciplina = courseContext.disciplina || ''
  const hoje = new Date().toLocaleDateString('pt-BR')

  return `Você é auditor rigoroso de material para concursos.
Concurso/cargo: ${concurso} | Banca: ${banca} | Disciplina: ${disciplina}
Data: ${hoje}. Use Google Search para confirmar fatos, vigência de leis e artigos.

Analise TODO o conteúdo. Classifique afirmações relevantes: CONFIRMADO | INCERTO | FALSO.

Responda APENAS JSON:
{
  "aprovado": true ou false,
  "problemas": [{"trecho": "...", "status": "FALSO|INCERTO", "motivo": "...", "correcao": "..."}],
  "texto_corrigido": null ou "JSON/texto corrigido COMPLETO (mesmo formato do original)"
}

Regras:
- aprovado=true SOMENTE se zero FALSO e no máximo 1 INCERTO leve.
- Qualquer FALSO factual ou jurídico → aprovado=false.
- Priorize estilo e exigências da banca ${banca}.
- Não invente leis. Se corrigir, devolva texto_corrigido completo.

CONTEÚDO:
${truncateForVerification(content)}`
}

function buildFlashcardAuditPrompt(flashcardsJson = '', courseContext = {}) {
  const banca = courseContext.banca || 'não definida'
  const concurso = courseContext.concursoName || courseContext.cargo || ''
  const disciplina = courseContext.disciplina || ''
  const topico = courseContext.topicoNome || ''

  return `Audite flashcards de concurso (banca ${banca}, cargo/concurso: ${concurso}).
Disciplina: ${disciplina} | Tópico: ${topico}

Use Google Search. Para CADA card verifique se a resposta (verso) está CORRETA e alinhada ao edital e ao estilo da banca.

Responda APENAS JSON:
{
  "aprovado": true ou false,
  "problemas": [{"trecho": "frente ou verso", "status": "FALSO|INCERTO", "motivo": "...", "correcao": "..."}],
  "texto_corrigido": null ou JSON {"flashcards":[...]} com TODOS os cards corrigidos
}

Regras:
- aprovado=true só se TODOS os cards estiverem corretos (zero FALSO).
- Cards genéricos demais ou fora do tópico → FALSO.
- Lei/artigo errado → FALSO.

FLASHCARDS:
${truncateForVerification(flashcardsJson, FLASHCARD_VERIFY_CHARS)}`
}

function buildConsistencyAuditPrompt({
  flashcardsSample = '',
  materialSample = '',
  questoesSample = '',
  courseContext = {},
} = {}) {
  const banca = courseContext.banca || 'não definida'
  const concurso = courseContext.concursoName || courseContext.cargo || ''

  return `Verifique CONSISTÊNCIA entre flashcards, material e questões do MESMO tópico.
Banca: ${banca} | Concurso/cargo: ${concurso}

Use Google Search se necessário. Detecte contradições factuais entre os três.

Responda APENAS JSON:
{"aprovado": true|false, "problemas": [{"trecho":"...", "status":"FALSO|INCERTO", "motivo":"..."}], "texto_corrigido": null}

aprovado=true só se não houver contradição entre FC, material e questões.

FLASHCARDS (amostra):
${flashcardsSample}

MATERIAL (trecho):
${materialSample.slice(0, 5000)}

QUESTÕES (trecho):
${questoesSample.slice(0, 5000)}`
}

function parseVerificationResult(rawText = '') {
  const rejected = {
    aprovado: false,
    problemas: [{ status: 'INCERTO', motivo: 'Auditoria não parseável' }],
    texto_corrigido: null,
  }

  try {
    const jsonMatch = String(rawText).match(/\{[\s\S]*\}/)
    if (!jsonMatch) return rejected
    const parsed = JSON.parse(jsonMatch[0])
    const problemas = Array.isArray(parsed.problemas) ? parsed.problemas : []
    const hasFalse = problemas.some((p) => String(p?.status || '').toUpperCase() === 'FALSO')
    const graveIncerto =
      problemas.filter((p) => String(p?.status || '').toUpperCase() === 'INCERTO').length > 1
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
  if (options.forceAudit === true) return true
  if (options.isLegalContent === false && !options.forceAudit) return false
  if (isLikelyLegalDiscipline(options.disciplina || '')) return true
  return textHasLegalClaims(text)
}

module.exports = {
  buildVerificationPrompt,
  buildFlashcardAuditPrompt,
  buildConsistencyAuditPrompt,
  parseVerificationResult,
  shouldRunVerification,
  truncateForVerification,
}
