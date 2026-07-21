/**
 * Contexto unificado de fidelidade: BANCA + CARGO + CONCURSO (+ nível).
 * Usado em flashcards, material e questões — mesma regra em todo lugar.
 */

const BANCA_GUIDES = {
  aocp: `INSTITUTO AOCP: múltipla escolha (A–E), enunciados diretos, interpretação literal da lei, alternativas plausíveis e distintas.`,
  cebraspe: `CEBRASPE/CESPE: Certo ou Errado (C/E), assertivas precisas, pegadinhas em termos absolutos, foco constitucional e em detalhes do texto legal.`,
  cespe: `CESPE/CEBRASPE: Certo ou Errado (C/E), assertivas precisas, atenção a termos absolutos.`,
  fgv: `FGV: questões contextualizadas, interpretação de texto, análise crítica, enunciados longos, alternativas bem elaboradas.`,
  fcc: `FCC: múltipla escolha (A–E), legislação atualizada, cobrança objetiva de artigos de lei.`,
  vunesp: `VUNESP: contextualização, interpretação, casos práticos, enunciados médios a longos.`,
  ibfc: `IBFC: múltipla escolha ou C/E conforme edital; cobrança direta de lei e doutrina consolidada.`,
  consulplan: `CONSULPLAN: múltipla escolha objetiva, foco em literalidade legal.`,
  quadrix: `QUADRIX: múltipla escolha, questões objetivas e diretas.`,
  idecan: `IDECAN: múltipla escolha, estilo objetivo.`,
}

const AREA_DIFFICULTY_HINTS = {
  policial: 'DIFÍCIL — legislação penal/processual, jurisprudência STF/STJ, temas atuais (JG, pacotes anticrime).',
  juridica: 'EXTREMAMENTE DIFÍCIL — precisão literal de lei, súmulas, jurisprudência vinculante.',
  fiscal: 'DIFÍCIL — legislação tributária e contábil atualizada.',
  saude: 'MÉDIO a DIFÍCIL — conhecimentos específicos + legislação do SUS.',
  administrativa: 'MÉDIO — direito administrativo, licitações, CF/88.',
  tecnica: 'MÉDIO — conhecimentos específicos da área + língua portuguesa.',
  geral: 'MÉDIO — edital amplo, equilíbrio entre disciplinas.',
}

/** Bancas tipicamente Certo/Errado. */
const CERTO_ERRADO_BANCAS = ['CESPE', 'CEBRASPE']

function normalizeBancaKey(banca = '') {
  return String(banca).toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function getBancaStyleGuide(banca = '') {
  const key = normalizeBancaKey(banca)
  if (!key) {
    return 'Banca não definida: use múltipla escolha objetiva e cite apenas legislação vigente com fonte.'
  }
  for (const [pattern, guide] of Object.entries(BANCA_GUIDES)) {
    if (key.includes(pattern)) return guide
  }
  return `Banca "${banca}": adapte ao estilo oficial desta banca; priorize literalidade legal e alternativas bem fundamentadas.`
}

export function inferDifficultyLevel(courseData = {}) {
  const text = [
    courseData.competition,
    courseData.name,
    courseData.cargo,
    courseData.area,
    courseData.nivel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/stf|stj|mpu|magistrad|defensor|procurador/.test(text)) return AREA_DIFFICULTY_HINTS.juridica
  if (/polícia|pm|pc|pf|prf|penal|gcm|guarda/.test(text)) return AREA_DIFFICULTY_HINTS.policial
  if (/fiscal|contador|receita|tribut/.test(text)) return AREA_DIFFICULTY_HINTS.fiscal
  if (/saúde|enferm|médic|farmác/.test(text)) return AREA_DIFFICULTY_HINTS.saude
  if (/administrativ|analista|técnico judiciário/.test(text)) return AREA_DIFFICULTY_HINTS.administrativa
  if (/engenh|informática|ti\b|tecnólog/.test(text)) return AREA_DIFFICULTY_HINTS.tecnica
  return AREA_DIFFICULTY_HINTS.geral
}

export function normalizeExamContext(raw = {}) {
  const banca = String(raw.banca || '').trim()
  const cargo = String(raw.cargo || raw.competition || '').trim()
  const concursoName = String(
    raw.concursoName || raw.competition || raw.courseName || raw.name || '',
  ).trim()
  const courseName = String(raw.courseName || raw.name || concursoName || '').trim()
  const nivelCurso = String(raw.nivel || raw.nivelCurso || raw.nivelCargo || raw.escolaridade || '').trim()
  const area = String(raw.area || '').trim()

  const tipoProva = resolveTipoProvaFromBanca(banca, raw.tipoProva)
  const dificuldade =
    raw.dificuldade ||
    inferDifficultyLevel({
      competition: concursoName,
      name: courseName,
      cargo,
      area,
      nivel: nivelCurso,
    })

  return {
    banca,
    cargo,
    concursoName,
    courseName,
    nivelCurso,
    area,
    tipoProva,
    dificuldade,
    editalText: raw.editalText || '',
    courseId: raw.courseId || null,
  }
}

export function resolveTipoProvaFromBanca(banca = '', explicit = '') {
  if (explicit === 'Certo/Errado' || explicit === 'CE' || explicit === 'CertoErrado') {
    return 'Certo/Errado'
  }
  if (
    explicit === 'ABCD' ||
    explicit === 'Múltipla Escolha' ||
    explicit === 'Multipla Escolha' ||
    explicit === 'ME'
  ) {
    return 'ABCD'
  }
  const u = String(banca || '').toUpperCase()
  if (CERTO_ERRADO_BANCAS.some((b) => u.includes(b))) return 'Certo/Errado'
  return 'ABCD'
}

/** Rótulo legível do formato da prova. */
export function formatTipoProvaLabel(tipoProva = '') {
  return isCertoErradoTipo(tipoProva) ? 'Certo/Errado' : 'Múltipla Escolha (A–E)'
}

export function isCertoErradoTipo(tipoProva = '') {
  const t = String(tipoProva || '').trim()
  return t === 'Certo/Errado' || t === 'CE' || t === 'CertoErrado'
}

/** Schema JSON de uma questão conforme o formato da banca. */
export function buildQuestaoJsonSchemaSnippet(tipoProva = 'ABCD', { includeExplicacao = true } = {}) {
  if (isCertoErradoTipo(tipoProva)) {
    return `"enunciado": "assertiva no estilo Certo/Errado",
      "respostaCorreta": "C",
      "correta": "C"${includeExplicacao ? ',\n      "explicacao": "por que é certo ou errado"' : ''}`
  }
  return `"enunciado": "texto da questão",
      "alternativas": {
        "A": "texto da alternativa A",
        "B": "texto da alternativa B",
        "C": "texto da alternativa C",
        "D": "texto da alternativa D",
        "E": "texto da alternativa E"
      },
      "respostaCorreta": "A",
      "correta": "A"${includeExplicacao ? ',\n      "explicacao": "explicação da alternativa correta"' : ''}`
}

/** Instruções de formato para o prompt. */
export function buildTipoProvaInstructions(tipoProva = 'ABCD') {
  if (isCertoErradoTipo(tipoProva)) {
    return `FORMATO OBRIGATÓRIO — CERTO/ERRADO (CESPE/CEBRASPE):
- Cada item é UMA assertiva (verdadeira ou falsa).
- Gabarito SOMENTE "C" (Certo) ou "E" (Errado).
- NÃO use alternativas A–E.
- NÃO misture com múltipla escolha.`
  }
  return `FORMATO OBRIGATÓRIO — MÚLTIPLA ESCOLHA (A–E):
- Cada questão tem EXATAMENTE 5 alternativas (A, B, C, D, E).
- Gabarito SOMENTE uma letra A–E.
- NÃO use Certo/Errado (C/E).
- NÃO misture com formato CESPE.`
}


/**
 * Bloco obrigatório injetado em TODO prompt de geração/auditoria.
 */
export function buildExamFidelityBlock(ctxInput = {}) {
  const ctx = normalizeExamContext(ctxInput)
  const hoje = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return `═══ FIDELIDADE OBRIGATÓRIA AO CONCURSO (NÃO VIOLAR) ═══
• CONCURSO: ${ctx.concursoName || 'NÃO DEFINIDO'}
• CARGO: ${ctx.cargo || 'NÃO DEFINIDO'}
• BANCA: ${ctx.banca || 'NÃO DEFINIDA'}
• TIPO DE PROVA DA BANCA: ${ctx.tipoProva}
• NÍVEL/ESCOLARIDADE DO CARGO: ${ctx.nivelCurso || 'conforme edital/cargo'}
• EXIGÊNCIA: ${ctx.dificuldade}
• ESTILO DA BANCA: ${getBancaStyleGuide(ctx.banca)}
• Data de referência: ${hoje}

REGRAS DE FIDELIDADE (100%):
1. TODO conteúdo DEVE ser específico para o CARGO "${ctx.cargo || 'do edital'}" no CONCURSO "${ctx.concursoName || 'indicado'}".
2. Estilo, pegadinhas, profundidade e formulação DEVEM seguir a BANCA "${ctx.banca || 'indicada'}" (${ctx.tipoProva}).
3. Priorize o que essa banca mais cobra PARA ESSE CARGO — descarte genérico de outros cargos/áreas.
4. Linguagem e nível de dificuldade alinhados ao cargo (${ctx.nivelCurso || 'edital'} / ${ctx.dificuldade}).
5. Não misture formato de outra banca (ex.: não use A–E se for Certo/Errado Cebraspe, e vice-versa).
6. Se citar lei/artigo, confirme vigência; nunca invente numeração.

`
}

/** Linhas curtas para prompts que já têm estrutura própria. */
export function buildExamFidelityInline(ctxInput = {}) {
  const ctx = normalizeExamContext(ctxInput)
  return `BANCA: ${ctx.banca || 'não definida'}
CONCURSO: ${ctx.concursoName || 'não definido'}
CARGO: ${ctx.cargo || 'não definido'}
NÍVEL DO CARGO: ${ctx.nivelCurso || 'conforme edital'}
TIPO DE PROVA: ${ctx.tipoProva}
EXIGÊNCIA: ${ctx.dificuldade}`
}

/** Meta padrão para flashcards / jobs — sempre com os 3 eixos. */
export function buildExamAwareFlashcardMeta(meta = {}, examCtx = {}) {
  const ctx = normalizeExamContext({ ...examCtx, ...meta })
  return {
    ...meta,
    banca: ctx.banca,
    cargo: ctx.cargo,
    concursoName: ctx.concursoName,
    courseName: ctx.courseName || meta.courseName || '',
    nivelCurso: ctx.nivelCurso,
    tipoProva: ctx.tipoProva,
    dificuldade: ctx.dificuldade,
    area: ctx.area,
  }
}

export function toCourseAiContextShape(examCtx = {}) {
  const ctx = normalizeExamContext(examCtx)
  return {
    banca: ctx.banca,
    cargo: ctx.cargo,
    competition: ctx.concursoName,
    name: ctx.courseName,
    nivel: ctx.nivelCurso,
    area: ctx.area,
    disciplina: examCtx.disciplina || '',
    topicoNome: examCtx.topicoNome || '',
  }
}
