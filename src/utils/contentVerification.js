/**
 * Auditoria pós-geração — 1 chamada extra (Flash, temp 0) para reduzir alucinações jurídicas.
 * Otimizado para APIs gratuitas: analisa trecho resumido, não o documento inteiro.
 */

const MAX_VERIFY_CHARS = 8000

const LEGAL_CLAIM_PATTERNS = [
  /lei\s+n[º°.]?\s*[\d.]+(?:\/\d{2,4})?/gi,
  /art(?:igo)?\.?\s*\d+/gi,
  /súmula\s+\d+/gi,
  /adi\s+\d+/gi,
  /stf|stj|tema\s+\d+/gi,
  /vigente|revogad|vetad|suspenso|inconstitucional/gi,
  /juiz\s+das\s+garantias/gi,
]

export function isLikelyLegalDiscipline(disciplina = '') {
  const n = String(disciplina || '').toLowerCase()
  return /direito|constitucional|penal|administrativ|processual|tribut|legisla|juríd|juridic|cf\/88|\bc\.?\s*c\.?|\bc\.?\s*p\.?|\bcpc\b|\bcpp\b|\bclt\b|emprego público|servidor/.test(
    n,
  )
}

export function truncateForVerification(text = '') {
  if (!text || text.length <= MAX_VERIFY_CHARS) return text

  const claims = []
  for (const pattern of LEGAL_CLAIM_PATTERNS) {
    const matches = text.match(pattern) || []
    claims.push(...matches)
  }

  const uniqueClaims = [...new Set(claims)].slice(0, 25)
  const head = text.slice(0, 4000)
  const tail = text.slice(-2000)

  if (uniqueClaims.length === 0) {
    return `${head}\n\n[...trecho omitido...]\n\n${tail}`.slice(0, MAX_VERIFY_CHARS)
  }

  return `${head}\n\nAFIRMAÇÕES A VERIFICAR:\n${uniqueClaims.join('\n')}\n\n${tail}`.slice(0, MAX_VERIFY_CHARS)
}

export function buildVerificationPrompt(content, courseData = {}) {
  const banca = courseData.banca || 'não definida'
  const concurso = courseData.competition || courseData.name || ''
  const hoje = new Date().toLocaleDateString('pt-BR')

  return `Você é auditor jurídico de material para concursos (${concurso}, banca ${banca}).
Data: ${hoje}. Use Google Search para confirmar vigência de leis, artigos vetados e status de normas (ex.: Juiz das Garantias).

Analise o conteúdo abaixo. Para cada afirmação jurídica relevante, classifique:
- CONFIRMADO (com fonte oficial)
- INCERTO (sem confirmação)
- FALSO (contradiz fonte oficial)

Responda APENAS com JSON válido:
{
  "aprovado": true ou false,
  "problemas": [{"trecho": "...", "status": "FALSO|INCERTO", "motivo": "...", "correcao": "..."}],
  "texto_corrigido": "texto completo corrigido OU null se aprovado"
}

Regras:
- aprovado=true somente se NÃO houver problemas FALSO e no máximo 1 INCERTO leve.
- Se houver FALSO ou INCERTO grave, aprovado=false e forneça texto_corrigido com as correções (mantenha formato JSON/markdown do original).
- Não invente leis. Remova ou corrija artigos vetados/revogados.

CONTEÚDO:
${truncateForVerification(content)}`
}

export function parseVerificationResult(rawText = '') {
  const defaultResult = { aprovado: true, problemas: [], texto_corrigido: null }

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return defaultResult
    const parsed = JSON.parse(jsonMatch[0])
    return {
      aprovado: parsed.aprovado !== false,
      problemas: Array.isArray(parsed.problemas) ? parsed.problemas : [],
      texto_corrigido: parsed.texto_corrigido || null,
    }
  } catch {
    return defaultResult
  }
}

export function shouldRunVerification(text = '', options = {}) {
  if (options.verifyContent === false) return false
  if (!text || text.length < 80) return false
  if (options.isLegalContent === false) return false
  // Com verifyContent explícito + disciplina jurídica: sempre audita
  if (options.verifyContent === true && options.isLegalContent === true) return true
  const hasLegalSignal = LEGAL_CLAIM_PATTERNS.some((p) => {
    const re = new RegExp(p.source, p.flags)
    return re.test(text)
  })
  return hasLegalSignal || options.isLegalContent === true
}

export function applyVerificationToResponse(response, verification, originalText) {
  if (!verification || verification.aprovado || !verification.texto_corrigido) {
    return response
  }

  const corrected = verification.texto_corrigido
  const candidate = response?.candidates?.[0]
  if (!candidate?.content?.parts?.[0]) return response

  return {
    ...response,
    candidates: [
      {
        ...candidate,
        content: {
          ...candidate.content,
          parts: [{ text: corrected }],
        },
      },
    ],
    _verification: {
      corrected: true,
      problemas: verification.problemas,
      originalLength: originalText?.length || 0,
    },
  }
}
