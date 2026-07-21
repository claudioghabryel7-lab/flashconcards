import { stripHtml } from './htmlTextHelpers.js'

export const CONTEUDO_COMPLETO_DEPTH = {
  MIN_TOPICOS_QUENTES: 6,
  MAX_TOPICOS_QUENTES: 10,
  MIN_QUESTOES: 8,
  /**
   * Faixa por resumo — completa, mas cabível em 6–8 itens no mesmo JSON
   * (faixas maiores faziam o modelo cortar em 1–2 resumos).
   */
  MIN_PALAVRAS_POR_RESUMO: 120,
  MAX_PALAVRAS_POR_RESUMO: 200,
  MIN_PALAVRAS_PEGADINHA: 40,
  MAX_PALAVRAS_PEGADINHA: 80,
  /** Comprimento mínimo de texto útil (sem HTML) para contar um resumo. */
  MIN_CHARS_RESUMO_UTIL: 80,
}

function plainTextLen(value) {
  return stripHtml(String(value || '')).trim().length
}

function asTopicName(item) {
  if (item == null) return ''
  if (typeof item === 'string') return item.trim()
  return String(item.titulo || item.nome || item.assunto || item.text || '').trim()
}

/**
 * Normaliza um item de revisão (string ou objeto com campos variados).
 */
export function normalizeRevisaoItem(raw, index = 0) {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const conteudo = raw.trim()
    if (!conteudo) return null
    return { titulo: `Resumo ${index + 1}`, conteudo }
  }
  if (typeof raw !== 'object') return null

  const conteudo = String(
    raw.conteudo || raw.resumo || raw.texto || raw.content || raw.html || raw.body || '',
  ).trim()
  if (!conteudo) return null

  const titulo = String(
    raw.titulo || raw.title || raw.assunto || raw.nome || `Resumo ${index + 1}`,
  ).trim()

  return { ...raw, titulo, conteudo }
}

/**
 * Aceita:
 * - revisaoTurbo: [{ titulo, conteudo }, ...]
 * - revisaoTurbo: { resumos: [...], pegadinhas?: [...] }
 * - resumos no nível raiz
 */
export function extractRevisaoTurboItems(parsed = {}) {
  const turbo = parsed?.revisaoTurbo
  let list = []

  if (Array.isArray(turbo)) {
    list = turbo
  } else if (turbo && typeof turbo === 'object') {
    if (Array.isArray(turbo.resumos)) list = turbo.resumos
    else if (Array.isArray(turbo.items)) list = turbo.items
  } else if (Array.isArray(parsed?.resumos)) {
    list = parsed.resumos
  }

  return list.map((item, i) => normalizeRevisaoItem(item, i)).filter(Boolean)
}

export function extractPegadinhas(parsed = {}) {
  if (Array.isArray(parsed?.pegadinhas)) return parsed.pegadinhas
  if (Array.isArray(parsed?.revisaoTurbo?.pegadinhas)) return parsed.revisaoTurbo.pegadinhas
  return []
}

/**
 * Normaliza o material para o formato canônico usado pela UI:
 * revisaoTurbo = array, pegadinhas = array no nível raiz.
 */
export function normalizeMaterialStructure(parsed = {}) {
  if (!parsed || typeof parsed !== 'object') return parsed

  const revisaoTurbo = extractRevisaoTurboItems(parsed)
  const pegadinhas = extractPegadinhas(parsed)
  const topicosRaw = parsed?.raioXProbabilidade?.topicosQuentes
  const topicosQuentes = Array.isArray(topicosRaw)
    ? topicosRaw.map(asTopicName).filter(Boolean)
    : []

  return {
    ...parsed,
    revisaoTurbo,
    pegadinhas,
    raioXProbabilidade: {
      ...(parsed.raioXProbabilidade || {}),
      topicosQuentes:
        topicosQuentes.length > 0
          ? topicosQuentes
          : parsed?.raioXProbabilidade?.topicosQuentes || [],
      padraoBanca: parsed?.raioXProbabilidade?.padraoBanca || '',
    },
  }
}

export function countUsableResumos(parsed = {}) {
  const items = extractRevisaoTurboItems(parsed)
  return items.filter((r) => plainTextLen(r.conteudo) >= CONTEUDO_COMPLETO_DEPTH.MIN_CHARS_RESUMO_UTIL)
    .length
}

export function getUsableResumos(parsed = {}) {
  const items = extractRevisaoTurboItems(parsed)
  return items.filter((r) => plainTextLen(r.conteudo) >= CONTEUDO_COMPLETO_DEPTH.MIN_CHARS_RESUMO_UTIL)
}

export function getConteudoCompletoDepthInstructions({
  banca,
  concursoName,
  courseName,
  cargo,
} = {}) {
  const {
    MIN_TOPICOS_QUENTES,
    MAX_TOPICOS_QUENTES,
    MIN_QUESTOES,
    MIN_PALAVRAS_POR_RESUMO,
    MAX_PALAVRAS_POR_RESUMO,
    MIN_PALAVRAS_PEGADINHA,
    MAX_PALAVRAS_PEGADINHA,
  } = CONTEUDO_COMPLETO_DEPTH

  const cargoLabel = cargo || courseName || 'mencionado'

  return `
⚖️ PROFUNDIDADE EQUILIBRADA — COMPLETO, OBJETIVO E SEM ENCHER LINGUIÇA:

1. PROIBIDO material superficial/telegráfico. Também PROIBIDO texto excessivo, repetitivo ou "apostolão".
2. Cubra o que realmente cai na banca ${banca || 'definida'} para ${concursoName || 'o concurso'} / cargo ${cargoLabel}.
3. Raio-X: EXATAMENTE ${MIN_TOPICOS_QUENTES} "Top Assuntos Quentes" (pode ir até ${MAX_TOPICOS_QUENTES} só se a disciplina for muito ampla).
4. Revisão Turbo: EXATAMENTE ${MIN_TOPICOS_QUENTES} blocos — UM para CADA assunto quente, na mesma ordem. NÃO entregue só 2 ou 3.
5. Cada bloco da Revisão Turbo: entre ${MIN_PALAVRAS_POR_RESUMO} e ${MAX_PALAVRAS_POR_RESUMO} palavras (meta ~150). Inclua:
   - conceito técnico claro
   - artigo/lei/jurisprudência só quando essencial
   - 1 exemplo prático do concurso/cargo ${cargoLabel}
   - 1 dica de memorização concreta
6. Pegadinhas: 3 a 5 itens; cada um com ${MIN_PALAVRAS_PEGADINHA}–${MAX_PALAVRAS_PEGADINHA} palavras.
7. Questões Preditivas: EXATAMENTE ${MIN_QUESTOES}; gabarito comentado fundamentado mas objetivo.
8. NÃO corte frases no meio. NÃO omita seções. NÃO invente leis.
9. PRIORIDADE: completar os ${MIN_TOPICOS_QUENTES} resumos. Prefira ${MIN_TOPICOS_QUENTES} resumos na faixa ${MIN_PALAVRAS_POR_RESUMO}–${MAX_PALAVRAS_POR_RESUMO} palavras a poucos resumos longos.
10. Formato HTML: <p>, <h4>, <b>, <mark>, <ul><li>. Sem markdown.
11. Campo revisaoTurbo DEVE ser um ARRAY com ${MIN_TOPICOS_QUENTES} objetos { "titulo", "conteudo" }.`
}

/**
 * Valida se o material gerado está suficientemente completo (não truncado/vazio).
 * @returns {{ ok: boolean, reason?: string, usable?: number, needed?: number }}
 */
export function isMaterialContentComplete(parsed = {}) {
  const material = normalizeMaterialStructure(parsed)
  const topicos = material?.raioXProbabilidade?.topicosQuentes
  const usable = countUsableResumos(material)
  const content = String(material?.content || '').trim()
  const titulo = String(material?.titulo || '').trim()
  const needed = CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES

  // Há revisão parcial mas abaixo do mínimo → incompleto (não aceitar só por ter título)
  if (usable > 0 && usable < needed) {
    const target =
      Array.isArray(topicos) && topicos.length > 0 ? Math.min(topicos.length, needed) : needed
    if (usable < target) {
      return {
        ok: false,
        reason: `Material incompleto/cortado: só ${usable} resumo(s) utilizáveis (mín. ${target}).`,
        usable,
        needed: target,
      }
    }
  }

  if (usable >= needed) {
    return { ok: true, usable, needed }
  }

  // Legado: material antigo só com content longo, sem revisaoTurbo estruturada
  if (usable === 0 && content.length >= 800) {
    return { ok: true, usable: 0, needed }
  }

  if (titulo.length > 3 && content.length < 80 && usable === 0) {
    return { ok: false, reason: 'Material incompleto (só título, sem conteúdo).', usable: 0, needed }
  }

  if (usable === 0 && content.length >= 200) {
    return { ok: true, usable: 0, needed }
  }

  if (usable === 0 && content.length < 200) {
    return {
      ok: false,
      reason: 'Material incompleto (sem revisão/conteúdo utilizável).',
      usable: 0,
      needed,
    }
  }

  return {
    ok: false,
    reason: 'Material incompleto (sem revisão/conteúdo utilizável).',
    usable,
    needed,
  }
}

function buildRepairPrompt(material, context = {}) {
  const needed = CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES
  const existing = extractRevisaoTurboItems(material)
  const usable = countUsableResumos(material)
  const missing = Math.max(needed - usable, 0)
  const topicos = (material?.raioXProbabilidade?.topicosQuentes || []).map(asTopicName).filter(Boolean)
  const existingTitles = existing.map((r) => r.titulo)
  const covered = new Set(existingTitles.map((t) => t.toLowerCase()))
  const pendingTopics = topicos.filter((t) => {
    const key = t.toLowerCase()
    return ![...covered].some((c) => c.includes(key.slice(0, 24)) || key.includes(c.slice(0, 24)))
  })

  const topicHints =
    pendingTopics.length > 0
      ? pendingTopics.slice(0, missing).map((t, i) => `${i + 1}. ${t}`).join('\n')
      : Array.from({ length: missing }, (_, i) => `${i + 1}. Assunto complementar ${i + 1} do tópico`).join(
          '\n',
        )

  return `O material JSON abaixo ficou INCOMPLETO: revisaoTurbo tem só ${usable} resumo(s) utilizáveis (mínimo obrigatório: ${needed}).

CONTEXTO:
- TÓPICO: ${context.topico || material.materia || material.titulo || ''}
- BANCA: ${context.banca || material.banca || ''}
- CARGO: ${context.cargo || material.cargo || ''}
- CONCURSO: ${context.concurso || material.concurso || ''}

TÍTULOS JÁ EXISTENTES (NÃO repetir):
${existingTitles.map((t, i) => `${i + 1}. ${t}`).join('\n') || '(nenhum)'}

ASSUNTOS QUE AINDA FALTAM (gere um resumo para cada):
${topicHints}

Gere APENAS JSON válido neste formato:
{
  "revisaoTurbo": [
    { "titulo": "assunto", "conteudo": "<h4>Conceito</h4><p>...</p><h4>Dica de memorização</h4><p>...</p>" }
  ]
}

REGRAS:
- Gere EXATAMENTE ${missing} novos itens em revisaoTurbo (não menos).
- Cada conteudo: ${CONTEUDO_COMPLETO_DEPTH.MIN_PALAVRAS_POR_RESUMO}–${CONTEUDO_COMPLETO_DEPTH.MAX_PALAVRAS_POR_RESUMO} palavras em HTML simples.
- Não invente leis. Não use markdown. Não copie os títulos já existentes.
- Retorne SOMENTE o JSON com revisaoTurbo (sem outras seções).`
}

/**
 * Garante material completo: normaliza e, se faltar resumo, pede reparo à IA.
 */
export async function ensureMaterialContentComplete(
  parsed,
  { generateAiJson, generateOptions = {}, context = {}, maxRepairs = 2 } = {},
) {
  let material = normalizeMaterialStructure(parsed)
  let check = isMaterialContentComplete(material)
  if (check.ok) return material

  if (typeof generateAiJson !== 'function') {
    const err = new Error(check.reason || 'Material incompleto.')
    err.code = 'material_incomplete'
    throw err
  }

  for (let attempt = 0; attempt < maxRepairs && !check.ok; attempt += 1) {
    const missing = Math.max((check.needed || CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES) - (check.usable || 0), 1)
    console.warn(
      `[material] incompleto (${check.usable}/${check.needed}). Reparo ${attempt + 1}/${maxRepairs} (+${missing} resumos)...`,
    )

    const patch = await generateAiJson(buildRepairPrompt(material, context), {
      ...generateOptions,
      useGoogleSearch: false,
      verifyContent: false,
      useRAG: false,
      maxContinues: generateOptions.maxContinues ?? 2,
      generationConfig: {
        ...(generateOptions.generationConfig || {}),
        maxOutputTokens: Math.max(generateOptions.generationConfig?.maxOutputTokens || 0, 16000),
        temperature: 0.2,
      },
    })

    const extras = extractRevisaoTurboItems(patch)
    if (!extras.length) {
      console.warn('[material] reparo não retornou resumos')
      continue
    }

    const existing = extractRevisaoTurboItems(material)
    const existingKeys = new Set(existing.map((r) => String(r.titulo || '').toLowerCase()))
    const merged = [
      ...existing,
      ...extras.filter((r) => !existingKeys.has(String(r.titulo || '').toLowerCase())),
    ]

    material = normalizeMaterialStructure({
      ...material,
      revisaoTurbo: merged,
    })
    check = isMaterialContentComplete(material)
  }

  if (!check.ok) {
    const err = new Error(check.reason || 'Material incompleto/cortado. Gere novamente.')
    err.code = 'material_incomplete'
    throw err
  }

  return material
}
