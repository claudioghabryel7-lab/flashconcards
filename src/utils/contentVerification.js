/**
 * Auditoria pós-geração — máxima confiabilidade prática.
 * Regra de ouro: nunca publicar com FALSO claro residual.
 * INCERTO / parse falho ≠ bloqueio (exceto jurídico com FALSO).
 */

const MAX_VERIFY_CHARS = 12000
const FLASHCARD_VERIFY_CHARS = 10000

/** Problemas fantasma: auditor reclama do recorte da amostra, não do conteúdo real. */
const PHANTOM_AUDIT_RE =
  /trecho omitido|frase incompleta|texto (está )?truncad|comprometendo a (clareza|integridade)|integridade do conteúdo|amostra parcial|<<<AMOSTRA_PARCIAL|meio do texto removido|falta de continuidade|clareza e a integridade/i

export const LEGAL_CLAIM_PATTERNS = [
  /lei\s+n[º°.]?\s*[\d.]+(?:\/\d{2,4})?/gi,
  /art(?:igo)?\.?\s*\d+/gi,
  /súmula\s+\d+/gi,
  /sumula\s+\d+/gi,
  /adi\s+\d+/gi,
  /stf|stj|tema\s+\d+/gi,
  /cf\/88|constituição federal/gi,
  /vigente|revogad|vetad|inconstitucional/gi,
  /juiz\s+das\s+garantias/gi,
]

export function isLikelyLegalDiscipline(disciplina = '') {
  const n = String(disciplina || '').toLowerCase()
  return /direito|constitucional|penal|administrativ|processual|tribut|legisla|juríd|juridic|cf\/88|\bc\.?\s*c\.?|\bc\.?\s*p\.?|\bcpc\b|\bcpp\b|\bclt\b|emprego público|servidor/.test(
    n,
  )
}

export function textHasLegalClaims(text = '') {
  const sample = String(text || '')
  if (sample.length < 20) return false
  return LEGAL_CLAIM_PATTERNS.some((p) => {
    const re = new RegExp(p.source, p.flags)
    return re.test(sample)
  })
}

function cutAtBoundary(text = '', maxLen, fromEnd = false) {
  const s = String(text || '')
  if (s.length <= maxLen) return s
  if (fromEnd) {
    const chunk = s.slice(-maxLen)
    const idx = chunk.search(/[\n.!?}]/)
    return idx > 0 && idx < 80 ? chunk.slice(idx + 1) : chunk
  }
  const chunk = s.slice(0, maxLen)
  const lastBreak = Math.max(
    chunk.lastIndexOf('\n'),
    chunk.lastIndexOf('. '),
    chunk.lastIndexOf('! '),
    chunk.lastIndexOf('? '),
    chunk.lastIndexOf('},'),
  )
  if (lastBreak > maxLen * 0.5) return chunk.slice(0, lastBreak + 1)
  return chunk
}

export function truncateForVerification(text = '', maxChars = MAX_VERIFY_CHARS) {
  if (!text || text.length <= maxChars) return text

  const claims = []
  for (const pattern of LEGAL_CLAIM_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags)
    const matches = String(text).match(re) || []
    claims.push(...matches)
  }

  const uniqueClaims = [...new Set(claims)].slice(0, 30)
  const marker =
    '\n\n<<<AMOSTRA_PARCIAL: meio do texto removido só para caber na auditoria. NÃO trate isso como erro, omissão ou frase incompleta do material.>>>\n\n'
  const budget = Math.max(500, maxChars - marker.length - 200)
  const head = cutAtBoundary(text, Math.floor(budget * 0.6), false)
  const tail = cutAtBoundary(text, Math.floor(budget * 0.35), true)

  if (uniqueClaims.length === 0) {
    return `${head}${marker}${tail}`.slice(0, maxChars)
  }

  return `${head}${marker}AFIRMAÇÕES A VERIFICAR:\n${uniqueClaims.join('\n')}\n\n${tail}`.slice(
    0,
    maxChars,
  )
}

/** Remove FALSOs inventados sobre truncagem da amostra de auditoria. */
export function isPhantomAuditProblem(problem = {}) {
  const blob = `${problem?.motivo || ''} ${problem?.trecho || ''} ${problem?.correcao || ''}`
  return PHANTOM_AUDIT_RE.test(blob)
}

function examHeader(courseData = {}) {
  const banca = courseData.banca || 'não definida'
  const concurso =
    courseData.competition || courseData.concursoName || courseData.name || ''
  const cargo = courseData.cargo || concurso || ''
  const disciplina = courseData.disciplina || ''
  const hoje = new Date().toLocaleDateString('pt-BR')
  return { banca, concurso, cargo, disciplina, hoje }
}

const AUDIT_SAMPLE_RULES = `
REGRAS DA AMOSTRA (obrigatórias):
- O conteúdo abaixo pode ser uma AMOSTRA PARCIAL (marcador <<<AMOSTRA_PARCIAL>>>).
- NUNCA marque FALSO por "trecho omitido", "frase incompleta", "texto truncado" ou falta de continuidade causada pela amostra.
- Avalie só afirmações factuais/jurídicas presentes no texto visível.
- Em dúvida → aprovado=true.
`.trim()

/** Auditoria jurídica rigorosa (Direito). */
export function buildVerificationPrompt(content, courseData = {}) {
  const { banca, concurso, cargo, disciplina, hoje } = examHeader(courseData)

  return `Você é auditor jurídico SÊNIOR de material para concursos.
Concurso: ${concurso} | Cargo: ${cargo} | Banca: ${banca} | Disciplina: ${disciplina}
Data: ${hoje}. Use Google Search em fontes oficiais (Planalto, STF, STJ).

Classifique afirmações: CONFIRMADO | INCERTO | FALSO.

Responda APENAS JSON:
{
  "aprovado": true ou false,
  "problemas": [{"trecho": "...", "status": "FALSO|INCERTO", "motivo": "...", "correcao": "..."}],
  "texto_corrigido": null ou "JSON/texto corrigido COMPLETO (mesmo formato do original)"
}

Regras:
- aprovado=false SOMENTE com FALSO claro (lei/artigo/jurisprudência/fato jurídico errado).
- INCERTO sem prova de erro → aprovado=true (não bloqueie).
- Lei/artigo inventado, vetado ou revogado citado como vigente → FALSO.
- Se houver FALSO, devolva texto_corrigido COMPLETO e correto.
- Fidelidade à banca ${banca} e cargo ${cargo}.
${AUDIT_SAMPLE_RULES}

CONTEÚDO:
${truncateForVerification(content)}`
}

/** 2ª passagem jurídica — confirma que não ficou FALSO. */
export function buildLegalConfirmPrompt(content, courseData = {}) {
  const { banca, cargo, disciplina, hoje } = examHeader(courseData)

  return `CONFIRMAÇÃO FINAL (auditor 2). Só aponte erros FALSOS inequívocos.
Banca: ${banca} | Cargo: ${cargo} | Disciplina: ${disciplina} | Data: ${hoje}
Use Google Search.

Responda APENAS JSON:
{
  "aprovado": true ou false,
  "problemas": [{"trecho":"...","status":"FALSO","motivo":"...","correcao":"..."}],
  "texto_corrigido": null ou JSON/texto completo corrigido
}

aprovado=false SÓ com FALSO comprovado. Em dúvida → aprovado=true.
${AUDIT_SAMPLE_RULES}

CONTEÚDO:
${truncateForVerification(content, 9000)}`
}

/**
 * Auditoria factual leve (Português, História, TI, etc.).
 * Cobre datas, conceitos e erros objetivos — sem travas jurídicas.
 */
export function buildFactualAuditPrompt(content, courseData = {}) {
  const { banca, concurso, cargo, disciplina, hoje } = examHeader(courseData)

  return `Você é auditor factual de material para concursos (disciplina NÃO jurídica).
Concurso: ${concurso} | Cargo: ${cargo} | Banca: ${banca} | Disciplina: ${disciplina}
Data: ${hoje}.

Responda APENAS JSON:
{
  "aprovado": true ou false,
  "problemas": [{"trecho": "...", "status": "FALSO|INCERTO", "motivo": "...", "correcao": "..."}],
  "texto_corrigido": null ou "JSON/texto corrigido COMPLETO"
}

Regras:
- aprovado=false SÓ se houver erro FALSO claro (data errada, conceito invertido, fato histórico falso).
- Preferência de estilo, clareza, frase incompleta na AMOSTRA ou INCERTO → aprovado=true.
- NÃO reprove por "clareza", "integridade" ou "trecho omitido".
- Se houver FALSO real, corrija e devolva texto_corrigido completo.
- Mantenha fidelidade à banca ${banca} e ao cargo ${cargo}.
${AUDIT_SAMPLE_RULES}

CONTEÚDO:
${truncateForVerification(content)}`
}

export function buildFlashcardAuditPrompt(flashcardsJson = '', courseData = {}, { legal = false } = {}) {
  const { banca, concurso, cargo, disciplina } = examHeader(courseData)
  const topico = courseData.topicoNome || courseData.topico || ''

  return `Audite flashcards de concurso (${legal ? 'modo JURÍDICO' : 'modo FACTUAL'}).
Banca: ${banca} | Concurso: ${concurso} | Cargo: ${cargo}
Disciplina: ${disciplina}
TÓPICO: ${topico || '(não informado)'}

Use Google Search só se necessário. Em dúvida, APROVE.

Responda APENAS JSON:
{
  "aprovado": true ou false,
  "problemas": [{"trecho": "frente ou verso", "status": "FALSO|FORA_DO_TOPICO|GENERICO|INCERTO", "motivo": "...", "correcao": "..."}],
  "texto_corrigido": null ou string JSON {"flashcards":[...]} com TODOS os cards
}

Regras:
- aprovado=false SOMENTE com erro FALSO claro (lei/artigo inventado, fato invertido) OU card claramente de outro tópico.
- GENERICO / INCERTO / estilo ruim → aprovado=true (não bloqueie o lote).
- FORA_DO_TOPICO só se o card for obviamente de outra matéria (não por ausência de keywords).
- Em dúvida → aprovado=true.
- Se reprovar, texto_corrigido deve ser STRING JSON válida com os cards.

FLASHCARDS:
${truncateForVerification(flashcardsJson, FLASHCARD_VERIFY_CHARS)}`
}

export function buildConsistencyAuditPrompt({
  flashcardsSample = '',
  materialSample = '',
  questoesSample = '',
  courseContext = {},
} = {}) {
  const { banca, concurso, cargo } = examHeader(courseContext)

  return `Verifique CONSISTÊNCIA entre flashcards, material e questões do MESMO tópico.
Banca: ${banca} | Concurso: ${concurso} | Cargo: ${cargo}

Detecte só contradições FALSAS claras entre os três. Em dúvida, aprove.

Responda APENAS JSON:
{"aprovado": true|false, "problemas": [{"trecho":"...","status":"FALSO|INCERTO","motivo":"..."}], "texto_corrigido": null}

FLASHCARDS (amostra):
${flashcardsSample}

MATERIAL (trecho):
${String(materialSample).slice(0, 5000)}

QUESTÕES (trecho):
${String(questoesSample).slice(0, 5000)}`
}

export function parseVerificationResult(rawText = {}) {
  // Parse falho = falha TÉCNICA (não FALSO). Tratar como FALSO regenerava conteúdo sem necessidade.
  const technicalFail = {
    aprovado: null,
    soft: true,
    parseError: true,
    problemas: [{ status: 'INCERTO', motivo: 'Auditoria retornou JSON inválido/ilegível' }],
    texto_corrigido: null,
    falsosCount: 0,
  }

  try {
    const jsonMatch = String(rawText).match(/\{[\s\S]*\}/)
    if (!jsonMatch) return technicalFail
    const parsed = JSON.parse(jsonMatch[0])
    const problemas = Array.isArray(parsed.problemas) ? parsed.problemas : []
    // Ignora FALSOs fantasma (auditor reclamando da amostra truncada)
    const realProblemas = problemas.filter((p) => !isPhantomAuditProblem(p))
    const blocking = realProblemas.filter((p) => {
      const s = String(p?.status || '').toUpperCase()
      return s === 'FALSO' || s === 'FORA_DO_TOPICO' || s === 'OFF_TOPIC'
    })
    let textoCorrigido = parsed.texto_corrigido || null
    if (textoCorrigido && typeof textoCorrigido !== 'string') {
      try {
        textoCorrigido = JSON.stringify(textoCorrigido)
      } catch {
        textoCorrigido = null
      }
    }
    // Se só havia fantasmas de truncagem → aprova
    if (blocking.length === 0) {
      return {
        aprovado: true,
        soft: problemas.length > realProblemas.length,
        parseError: false,
        problemas: realProblemas,
        texto_corrigido: null,
        falsosCount: 0,
      }
    }
    const aprovadoExplicit = parsed.aprovado === true && blocking.length === 0
    return {
      aprovado: aprovadoExplicit || (blocking.length === 0 && parsed.aprovado !== false),
      soft: false,
      parseError: false,
      problemas: realProblemas,
      texto_corrigido: textoCorrigido,
      falsosCount: blocking.length,
    }
  } catch {
    return technicalFail
  }
}

/**
 * Trusted: sempre audita (jurídico ou factual).
 * verifyContent false → pula.
 */
export function shouldRunVerification(text = '', options = {}) {
  if (options.verifyContent === false) return false
  if (!text || text.length < 80) return false
  if (options.forceAudit === true) return true
  if (options.auditMode === 'factual' || options.auditMode === 'legal') return true
  if (isLikelyLegalDiscipline(options.disciplina || '')) return true
  if (options.isLegalContent === true) return true
  if (options.isLegalContent === false) return Boolean(options.forceAudit)
  return textHasLegalClaims(text)
}

export function applyVerificationToResponse(response, verification, originalText) {
  if (!verification || verification.aprovado || !verification.texto_corrigido) {
    return response
  }

  const correctedRaw = verification.texto_corrigido
  const corrected =
    typeof correctedRaw === 'string' ? correctedRaw : JSON.stringify(correctedRaw)
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

export function summarizeAuditProblems(problemas = [], limit = 3) {
  return (problemas || [])
    .slice(0, limit)
    .map((p) => p.motivo || p.status)
    .filter(Boolean)
    .join('; ')
}
