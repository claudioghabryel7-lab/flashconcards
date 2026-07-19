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
  const concurso = courseContext.concursoName || courseContext.competition || ''
  const cargo = courseContext.cargo || concurso || ''
  const disciplina = courseContext.disciplina || ''
  const hoje = new Date().toLocaleDateString('pt-BR')

  return `Você é auditor rigoroso de material para concursos.
Concurso: ${concurso} | Cargo: ${cargo} | Banca: ${banca} | Disciplina: ${disciplina}
Data: ${hoje}. Use Google Search para confirmar fatos, vigência de leis e artigos.
Reprove conteúdo genérico demais para outro cargo/banca.

Analise TODO o conteúdo. Classifique afirmações relevantes: CONFIRMADO | INCERTO | FALSO.

Responda APENAS JSON:
{
  "aprovado": true ou false,
  "problemas": [{"trecho": "...", "status": "FALSO|INCERTO", "motivo": "...", "correcao": "..."}],
  "texto_corrigido": null ou "JSON/texto corrigido COMPLETO (mesmo formato do original)"
}

Regras:
- aprovado=false SOMENTE se houver erro FALSO claro e verificável.
- INCERTO ou falta de confirmação → NÃO reprove (aprovado=true).
- Em dúvida, aprove. Só reprove com evidência de erro.
- Se houver FALSO, corrija e devolva texto_corrigido completo.

CONTEÚDO:
${truncateForVerification(content)}`
}

function buildFlashcardAuditPrompt(flashcardsJson = '', courseContext = {}) {
  const banca = courseContext.banca || 'não definida'
  const concurso = courseContext.concursoName || courseContext.competition || ''
  const cargo = courseContext.cargo || concurso || ''
  const disciplina = courseContext.disciplina || ''
  const topico = courseContext.topicoNome || ''

  return `Audite flashcards de concurso.
Banca: ${banca} | Concurso: ${concurso} | Cargo: ${cargo}
Disciplina: ${disciplina} | Tópico: ${topico}

Use Google Search. Para CADA card verifique se a resposta (verso) está CORRETA e alinhada ao edital, ao CARGO e ao estilo da BANCA.

Responda APENAS JSON:
{
  "aprovado": true ou false,
  "problemas": [{"trecho": "frente ou verso", "status": "FALSO|INCERTO", "motivo": "...", "correcao": "..."}],
  "texto_corrigido": null ou JSON {"flashcards":[...]} com TODOS os cards corrigidos
}

Regras:
- aprovado=false SOMENTE se houver card com erro FALSO claro.
- Card genérico → NÃO reprova (no máximo INCERTO).
- Em dúvida, aprove.

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
  const concurso = courseContext.concursoName || courseContext.competition || ''
  const cargo = courseContext.cargo || concurso || ''

  return `Verifique CONSISTÊNCIA entre flashcards, material e questões do MESMO tópico.
Banca: ${banca} | Concurso: ${concurso} | Cargo: ${cargo}

Use Google Search se necessário. Detecte contradições factuais entre os três.
Reprove se algum asset estiver genérico ou alinhado a outro cargo/banca.

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
  const softPass = {
    aprovado: true,
    soft: true,
    problemas: [],
    texto_corrigido: null,
  }

  try {
    const jsonMatch = String(rawText).match(/\{[\s\S]*\}/)
    if (!jsonMatch) return softPass
    const parsed = JSON.parse(jsonMatch[0])
    const problemas = Array.isArray(parsed.problemas) ? parsed.problemas : []
    const falsos = problemas.filter((p) => String(p?.status || '').toUpperCase() === 'FALSO')
    return {
      aprovado: falsos.length === 0,
      soft: falsos.length === 0 && parsed.aprovado !== true,
      problemas,
      texto_corrigido: parsed.texto_corrigido || null,
      falsosCount: falsos.length,
    }
  } catch {
    return softPass
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
