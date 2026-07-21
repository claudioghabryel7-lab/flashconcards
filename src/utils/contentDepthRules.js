import { stripHtml } from './htmlTextHelpers.js'

export const CONTEUDO_COMPLETO_DEPTH = {
  MIN_TOPICOS_QUENTES: 6,
  MAX_TOPICOS_QUENTES: 10,
  MIN_QUESTOES: 8,
  /** Faixa por resumo da Revisão Turbo — material de estudo, não telegrama. */
  MIN_PALAVRAS_POR_RESUMO: 280,
  MAX_PALAVRAS_POR_RESUMO: 420,
  /** Esqueleto (fase 1): stubs curtos para caber no 1º JSON sem cortar. */
  MIN_PALAVRAS_ESQUELETO: 55,
  MAX_PALAVRAS_ESQUELETO: 95,
  MIN_PALAVRAS_PEGADINHA: 60,
  MAX_PALAVRAS_PEGADINHA: 110,
  /** Texto útil mínimo (sem HTML) para contar um resumo como presente (esqueleto ok). */
  MIN_CHARS_RESUMO_UTIL: 160,
  /** Texto útil mínimo para considerar o resumo com profundidade de prova. */
  MIN_CHARS_RESUMO_PROFUNDO: 980,
  /** padraoBanca mínimo (sem HTML). */
  MIN_CHARS_PADRAO_BANCA: 420,
  MIN_PALAVRAS_PADRAO_BANCA: 140,
  MAX_PALAVRAS_PADRAO_BANCA: 240,
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

/**
 * Instruções da FASE 1 (esqueleto): JSON leve para NÃO estourar tokens.
 * A profundidade da Revisão Turbo vem depois, item a item.
 */
export function getConteudoCompletoSkeletonInstructions({
  banca,
  concursoName,
  courseName,
  cargo,
} = {}) {
  const {
    MIN_TOPICOS_QUENTES,
    MAX_TOPICOS_QUENTES,
    MIN_QUESTOES,
    MIN_PALAVRAS_ESQUELETO,
    MAX_PALAVRAS_ESQUELETO,
    MIN_PALAVRAS_PEGADINHA,
    MAX_PALAVRAS_PEGADINHA,
    MIN_PALAVRAS_PADRAO_BANCA,
    MAX_PALAVRAS_PADRAO_BANCA,
  } = CONTEUDO_COMPLETO_DEPTH

  const cargoLabel = cargo || courseName || 'mencionado'
  const bancaLabel = banca || 'definida'

  return `
🧩 FASE 1 — ESQUELETO COMPLETO (NÃO escreva resumos longos agora):

1. Cubra o que realmente cai na banca ${bancaLabel} para ${concursoName || 'o concurso'} / cargo ${cargoLabel}.
2. Raio-X: EXATAMENTE ${MIN_TOPICOS_QUENTES} "Top Assuntos Quentes" (até ${MAX_TOPICOS_QUENTES} só se a disciplina for muito ampla).
3. PADRÃO DA BANCA (raioXProbabilidade.padraoBanca) — DETALHADO (${MIN_PALAVRAS_PADRAO_BANCA}–${MAX_PALAVRAS_PADRAO_BANCA} palavras):
   - Como a ${bancaLabel} formula questões DESTE tópico para o cargo ${cargoLabel}
   - O que mais cobra; verbos/estruturas típicas; pegadinhas; exemplo concreto; o que NÃO cai
4. REVISÃO TURBO — EXATAMENTE ${MIN_TOPICOS_QUENTES} itens (um por assunto quente).
   ⚠️ CADA "conteudo" é um RASCUNHO CURTO de ${MIN_PALAVRAS_ESQUELETO}–${MAX_PALAVRAS_ESQUELETO} palavras:
   - 1 parágrafo com a ideia central + 1 ponto de atenção da banca
   - NÃO escreva as 6 seções longas agora (virão numa 2ª passagem)
   - NÃO ultrapasse ~${MAX_PALAVRAS_ESQUELETO} palavras por item (senão o JSON corta)
5. Pegadinhas: 3 a 5 itens (${MIN_PALAVRAS_PEGADINHA}–${MAX_PALAVRAS_PEGADINHA} palavras), tipicamente da ${bancaLabel}.
6. Questões Preditivas: EXATAMENTE ${MIN_QUESTOES}; gabarito comentado (pode ser objetivo).
7. NÃO invente leis. NÃO use markdown. HTML: <p>, <h4>, <b>, <mark>, <ul><li>.
8. revisaoTurbo = ARRAY com ${MIN_TOPICOS_QUENTES} objetos { "titulo", "conteudo" }.
9. PRIORIDADE: JSON VÁLIDO E COMPLETO com os ${MIN_TOPICOS_QUENTES} stubs — profundidade depois.`
}

/** Instruções de profundidade (usadas no aprofundamento item a item). */
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
    MIN_PALAVRAS_PADRAO_BANCA,
    MAX_PALAVRAS_PADRAO_BANCA,
  } = CONTEUDO_COMPLETO_DEPTH

  const cargoLabel = cargo || courseName || 'mencionado'
  const bancaLabel = banca || 'definida'

  return `
⚖️ PROFUNDIDADE DE PROVA — MATERIAL DE ESTUDO REAL (NÃO TELEGRAMA):

1. PROIBIDO resumo raso/telegráfico/genérico. PROIBIDO frases vazias ("é importante", "vale ressaltar", "a banca cobra o tema") sem conteúdo concreto.
2. Cubra o que realmente cai na banca ${bancaLabel} para ${concursoName || 'o concurso'} / cargo ${cargoLabel}.
3. Raio-X: EXATAMENTE ${MIN_TOPICOS_QUENTES} "Top Assuntos Quentes" (até ${MAX_TOPICOS_QUENTES} só se a disciplina for muito ampla).
4. PADRÃO DA BANCA (raioXProbabilidade.padraoBanca) — DETALHADO (${MIN_PALAVRAS_PADRAO_BANCA}–${MAX_PALAVRAS_PADRAO_BANCA} palavras):
   - Como a ${bancaLabel} formula questões DESTE tópico para o cargo ${cargoLabel}
   - O que mais cobra; verbos/estruturas típicas; pegadinhas; exemplo concreto; o que NÃO cai
5. REVISÃO TURBO — o coração do material. EXATAMENTE ${MIN_TOPICOS_QUENTES} blocos, um por assunto quente.
   Cada bloco: ${MIN_PALAVRAS_POR_RESUMO}–${MAX_PALAVRAS_POR_RESUMO} palavras (meta ~340). Estrutura OBRIGATÓRIA em HTML:
   - <h4>Conceito central</h4> — definição precisa + elementos/requisitos
   - <h4>Base normativa</h4> — artigo/lei/súmula essenciais (só o que for real)
   - <h4>Distinções e exceções</h4> — o que o aluno confunde; fronteiras do instituto
   - <h4>Na prática da banca</h4> — como a ${bancaLabel} cobra ESTE ponto no cargo ${cargoLabel} (específico, não genérico)
   - <h4>Margens de dúvida</h4> — 2–4 pontos que geram erro na prova + resposta objetiva
   - <h4>Dica de memorização</h4>
6. Cada resumo deve FECHAR dúvidas: não deixe conceitos pela metade; diga a regra, a exceção e o que NÃO se aplica.
7. Pegadinhas: 3 a 5 itens (${MIN_PALAVRAS_PEGADINHA}–${MAX_PALAVRAS_PEGADINHA} palavras), tipicamente da ${bancaLabel}.
8. Questões Preditivas: EXATAMENTE ${MIN_QUESTOES}; gabarito comentado fundamentado.
9. NÃO invente leis. NÃO use markdown. HTML: <p>, <h4>, <b>, <mark>, <ul><li>.
10. revisaoTurbo = ARRAY com ${MIN_TOPICOS_QUENTES} objetos { "titulo", "conteudo" }.`
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

function wordCountApprox(value) {
  const plain = stripHtml(String(value || '')).trim()
  if (!plain) return 0
  return plain.split(/\s+/).filter(Boolean).length
}

function getPadraoBanca(material = {}) {
  return String(material?.raioXProbabilidade?.padraoBanca || '').trim()
}

export function isPadraoBancaAdequate(material = {}) {
  const padrao = getPadraoBanca(material)
  return plainTextLen(padrao) >= CONTEUDO_COMPLETO_DEPTH.MIN_CHARS_PADRAO_BANCA
}

/** Detecta texto genérico / incompleto na Revisão Turbo. */
export function isResumoDeepEnough(item = {}) {
  const html = String(item?.conteudo || '')
  const plain = stripHtml(html).trim()
  const chars = plain.length
  const words = wordCountApprox(html)
  if (chars < CONTEUDO_COMPLETO_DEPTH.MIN_CHARS_RESUMO_PROFUNDO) return false
  if (words < CONTEUDO_COMPLETO_DEPTH.MIN_PALAVRAS_POR_RESUMO) return false

  const lower = html.toLowerCase()
  const hasBanca = /pr[áa]tica da banca|como a banca|cobran[çc]a t[íi]pica|a banca costuma|a banca cobra/.test(
    lower,
  )
  const hasDuvida =
    /margens? de d[úu]vida|n[ãa]o confunda|aten[çc][ãa]o|pegadinha|distin[çc][õo]es|exce[çc][õo]es|aluno confunde|erro comum/.test(
      lower,
    )
  const hasConceito = /conceito|defini[çc][ãa]o|elementos|requisitos|base normativa/.test(lower)

  // Frases genéricas sem substância: se o texto for curto nessas seções, falha
  const genericHits = (
    plain.match(/\b(é importante|vale ressaltar|nesse sentido|de forma geral|em regra geral)\b/gi) || []
  ).length
  if (genericHits >= 3 && words < CONTEUDO_COMPLETO_DEPTH.MIN_PALAVRAS_POR_RESUMO + 40) {
    return false
  }

  return hasBanca && hasDuvida && hasConceito
}

export function getShallowResumos(parsed = {}) {
  return extractRevisaoTurboItems(parsed).filter((r) => !isResumoDeepEnough(r))
}

export function isMaterialDepthAdequate(parsed = {}) {
  const material = normalizeMaterialStructure(parsed)
  const complete = isMaterialContentComplete(material)
  if (!complete.ok) return { ...complete, depthOk: false }

  if (!isPadraoBancaAdequate(material)) {
    return {
      ok: false,
      depthOk: false,
      reason: 'Padrão da banca ausente ou muito superficial — precisa explicar como a banca cobra o tópico.',
      usable: complete.usable,
      needed: complete.needed,
    }
  }

  const shallow = getShallowResumos(material)
  if (shallow.length > 0) {
    return {
      ok: false,
      depthOk: false,
      reason: `Revisão Turbo incompleta/genérica: ${shallow.length} resumo(s) ainda rasos (faltam conceito, prática da banca e margens de dúvida).`,
      usable: complete.usable,
      needed: complete.needed,
      shallowTitles: shallow.map((r) => r.titulo),
    }
  }

  return { ok: true, depthOk: true, usable: complete.usable, needed: complete.needed }
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

  const banca = context.banca || material.banca || 'a banca'
  const cargo = context.cargo || material.cargo || 'o cargo'
  const { MIN_PALAVRAS_ESQUELETO, MAX_PALAVRAS_ESQUELETO } = CONTEUDO_COMPLETO_DEPTH

  return `O material JSON ficou INCOMPLETO: revisaoTurbo tem só ${usable} resumo(s) (mínimo: ${needed}).
Complete com ESQUELETOS CURTOS (não resumos longos — a profundidade virá depois, item a item).

CONTEXTO:
- TÓPICO: ${context.topico || material.materia || material.titulo || ''}
- BANCA: ${banca}
- CARGO: ${cargo}
- CONCURSO: ${context.concurso || material.concurso || ''}

TÍTULOS JÁ EXISTENTES (NÃO repetir):
${existingTitles.map((t, i) => `${i + 1}. ${t}`).join('\n') || '(nenhum)'}

ASSUNTOS QUE AINDA FALTAM:
${topicHints}

Gere APENAS JSON:
{
  "revisaoTurbo": [
    {
      "titulo": "assunto",
      "conteudo": "<p>Rascunho curto: ideia central + 1 ponto de atenção da banca.</p>"
    }
  ]
}

REGRAS:
- EXATAMENTE ${missing} novos itens.
- Cada conteudo: ${MIN_PALAVRAS_ESQUELETO}–${MAX_PALAVRAS_ESQUELETO} palavras (rascunho).
- NÃO escreva as 6 seções longas agora.
- Específico da ${banca} / cargo ${cargo}.
- Sem markdown. Sem inventar leis.
- JSON completo e curto.`
}

function buildPadraoBancaPrompt(material, context = {}) {
  const banca = context.banca || material.banca || 'a banca'
  const cargo = context.cargo || material.cargo || 'o cargo'
  const topico = context.topico || material.materia || material.titulo || ''
  const topicos = (material?.raioXProbabilidade?.topicosQuentes || []).map(asTopicName).filter(Boolean)
  const atual = getPadraoBanca(material)

  return `Reescreva o campo padraoBanca deste material. O texto atual está ausente ou superficial (${wordCountApprox(atual)} palavras).

TÓPICO: ${topico}
BANCA: ${banca}
CARGO: ${cargo}
CONCURSO: ${context.concurso || material.concurso || ''}
ASSUNTOS QUENTES: ${topicos.join('; ') || '(não listados)'}

TEXTO ATUAL (melhorar/expandir):
${atual || '(vazio)'}

Gere APENAS JSON:
{
  "padraoBanca": "<h4>Como a banca cobra</h4><p>...</p><h4>O que mais cai</h4><ul><li>...</li></ul><h4>Pegadinhas recorrentes</h4><ul><li>...</li></ul><h4>Exemplo típico de cobrança</h4><p>...</p><h4>O que costuma NÃO cair</h4><p>...</p>"
}

REGRAS:
- ${CONTEUDO_COMPLETO_DEPTH.MIN_PALAVRAS_PADRAO_BANCA}–${CONTEUDO_COMPLETO_DEPTH.MAX_PALAVRAS_PADRAO_BANCA} palavras
- Específico da ${banca} para o cargo ${cargo} neste tópico — nada genérico
- HTML simples (<h4>, <p>, <ul>, <li>, <b>, <mark>)
- Sem markdown`
}

function buildEnrichResumosPrompt(batch, context = {}, material = {}) {
  const banca = context.banca || material.banca || 'a banca'
  const cargo = context.cargo || material.cargo || 'o cargo'
  const topico = context.topico || material.materia || material.titulo || ''
  const concurso = context.concurso || material.concurso || ''

  const itemsBlock = batch
    .map(
      (r, i) => `### Item ${i + 1}
Título: ${r.titulo}
Conteúdo atual (EXPANDIR e ESPECIFICAR — não encolher, não generalizar):
${String(r.conteudo || '').slice(0, 1800)}`,
    )
    .join('\n\n')

  return `Reescreva a Revisão Turbo abaixo. Está genérica, rasa ou com margens de dúvida abertas.

TÓPICO DO EDITAL: ${topico}
BANCA: ${banca}
CARGO: ${cargo}
CONCURSO: ${concurso}

${itemsBlock}

Gere APENAS JSON:
{
  "revisaoTurbo": [
    {
      "titulo": "mesmo título",
      "conteudo": "<h4>Conceito central</h4><p>...</p><h4>Base normativa</h4><p>...</p><h4>Distinções e exceções</h4><ul><li>...</li></ul><h4>Na prática da banca</h4><p>...</p><h4>Margens de dúvida</h4><ul><li><b>Dúvida:</b> ... <b>Resposta:</b> ...</li></ul><h4>Dica de memorização</h4><p>...</p>"
    }
  ]
}

REGRAS DE QUALIDADE (obrigatórias):
- Mantenha os MESMOS títulos, na mesma ordem
- Cada conteudo: ${CONTEUDO_COMPLETO_DEPTH.MIN_PALAVRAS_POR_RESUMO}–${CONTEUDO_COMPLETO_DEPTH.MAX_PALAVRAS_POR_RESUMO} palavras
- As 6 seções HTML acima são OBRIGATÓRIAS
- "Margens de dúvida": pelo menos 2 itens no formato Dúvida → Resposta objetiva
- "Na prática da banca": específico da ${banca} no cargo ${cargo} (proibido genérico)
- Feche o assunto: regra + exceção + o que NÃO se aplica
- Cite norma real só se tiver certeza; senão omita o número e explique o instituto
- Sem markdown. Sem enrolação.`
}

function buildSingleResumoDeepPrompt(item, context = {}, material = {}) {
  return buildEnrichResumosPrompt([item], context, material)
}

async function callMaterialPatch(generateAiJson, generateOptions, prompt) {
  return generateAiJson(prompt, {
    ...generateOptions,
    useGoogleSearch: generateOptions.useGoogleSearch === true,
    verifyContent: false,
    useRAG: false,
    maxContinues: generateOptions.maxContinues ?? 2,
    generationConfig: {
      ...(generateOptions.generationConfig || {}),
      maxOutputTokens: Math.max(generateOptions.generationConfig?.maxOutputTokens || 0, 20000),
      temperature: 0.18,
    },
  })
}

async function deepenOneResumo(item, { generateAiJson, generateOptions, context, material }) {
  const patch = await callMaterialPatch(
    generateAiJson,
    generateOptions,
    buildSingleResumoDeepPrompt(item, context, material),
  )
  const expanded = extractRevisaoTurboItems(patch)
  const hit =
    expanded.find((r) => String(r.titulo || '').toLowerCase() === String(item.titulo || '').toLowerCase()) ||
    expanded[0]
  if (!hit?.conteudo) return item
  if (plainTextLen(hit.conteudo) > plainTextLen(item.conteudo) || isResumoDeepEnough(hit)) {
    return { ...item, titulo: item.titulo, conteudo: hit.conteudo }
  }
  return item
}

/**
 * Garante material completo E com Revisão Turbo profunda (fecha margens de dúvida).
 * Fluxo em fases: (1) completar esqueleto se faltarem itens, (2) padraoBanca,
 * (3) aprofundar Revisão Turbo item a item — evita JSON monolítico que corta.
 */
export async function ensureMaterialContentComplete(
  parsed,
  {
    generateAiJson,
    generateOptions = {},
    context = {},
    maxRepairs = 3,
    enrichDepth = true,
    deepenOneByOne = true,
    onProgress = null,
  } = {},
) {
  const notify = (msg) => {
    if (typeof onProgress === 'function') {
      try {
        onProgress(msg)
      } catch {
        /* ignore */
      }
    }
  }

  let material = normalizeMaterialStructure(parsed)
  let check = isMaterialContentComplete(material)

  if (!check.ok && typeof generateAiJson !== 'function') {
    const err = new Error(check.reason || 'Material incompleto.')
    err.code = 'material_incomplete'
    throw err
  }

  // 1) Completar quantidade com ESQUELETOS curtos (não profundos — evita novo corte)
  for (let attempt = 0; attempt < maxRepairs && !check.ok; attempt += 1) {
    const missing = Math.max((check.needed || CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES) - (check.usable || 0), 1)
    console.warn(
      `[material] incompleto (${check.usable}/${check.needed}). Reparo esqueleto ${attempt + 1}/${maxRepairs} (+${missing})...`,
    )
    notify(`Completando esqueleto da Revisão Turbo (${check.usable}/${check.needed})…`)

    const patch = await callMaterialPatch(
      generateAiJson,
      {
        ...generateOptions,
        maxContinues: Math.min(generateOptions.maxContinues ?? 2, 2),
        generationConfig: {
          ...(generateOptions.generationConfig || {}),
          maxOutputTokens: Math.min(
            Math.max(generateOptions.generationConfig?.maxOutputTokens || 0, 8000),
            12000,
          ),
          temperature: 0.15,
        },
      },
      buildRepairPrompt(material, context),
    )
    const extras = extractRevisaoTurboItems(patch)
    if (!extras.length) {
      console.warn('[material] reparo não retornou resumos')
      continue
    }

    const existing = extractRevisaoTurboItems(material)
    const existingKeys = new Set(existing.map((r) => String(r.titulo || '').toLowerCase()))
    material = normalizeMaterialStructure({
      ...material,
      revisaoTurbo: [
        ...existing,
        ...extras.filter((r) => !existingKeys.has(String(r.titulo || '').toLowerCase())),
      ],
    })
    check = isMaterialContentComplete(material)
  }

  if (!check.ok) {
    const err = new Error(check.reason || 'Material incompleto/cortado. Gere novamente.')
    err.code = 'material_incomplete'
    throw err
  }

  if (!enrichDepth || typeof generateAiJson !== 'function') {
    return material
  }

  // 2) Expandir padrão da banca se superficial
  if (!isPadraoBancaAdequate(material)) {
    console.warn('[material] enriquecendo padraoBanca…')
    notify('Aprofundando o padrão da banca…')
    try {
      const patch = await callMaterialPatch(
        generateAiJson,
        { ...generateOptions, useGoogleSearch: true },
        buildPadraoBancaPrompt(material, context),
      )
      const nextPadrao = String(patch?.padraoBanca || patch?.raioXProbabilidade?.padraoBanca || '').trim()
      if (nextPadrao) {
        material = normalizeMaterialStructure({
          ...material,
          raioXProbabilidade: {
            ...(material.raioXProbabilidade || {}),
            padraoBanca: nextPadrao,
          },
        })
      }
    } catch (err) {
      console.warn('[material] falha ao enriquecer padraoBanca:', err?.message || err)
    }
  }

  // 3) Aprofundar Revisão Turbo — sempre 1 a 1 (stubs da fase 1 → profundidade)
  let shallow = getShallowResumos(material)
  if (deepenOneByOne && shallow.length > 0) {
    console.warn(`[material] aprofundando Revisão Turbo item a item (${shallow.length} rasos)…`)
    const current = extractRevisaoTurboItems(material)
    const total = current.length
    const deepened = []
    let idx = 0
    for (const item of current) {
      idx += 1
      if (isResumoDeepEnough(item)) {
        deepened.push(item)
        continue
      }
      notify(`Aprofundando Revisão Turbo ${idx}/${total}: ${item.titulo || 'resumo'}…`)
      try {
        let next = await deepenOneResumo(item, {
          generateAiJson,
          generateOptions: {
            ...generateOptions,
            useGoogleSearch: true,
            maxContinues: Math.min(generateOptions.maxContinues ?? 2, 2),
            generationConfig: {
              ...(generateOptions.generationConfig || {}),
              maxOutputTokens: Math.min(
                Math.max(generateOptions.generationConfig?.maxOutputTokens || 0, 10000),
                14000,
              ),
              temperature: 0.18,
            },
          },
          context,
          material,
        })
        if (!isResumoDeepEnough(next)) {
          next = await deepenOneResumo(next, {
            generateAiJson,
            generateOptions: {
              ...generateOptions,
              maxContinues: 1,
              generationConfig: {
                ...(generateOptions.generationConfig || {}),
                maxOutputTokens: 12000,
                temperature: 0.12,
              },
            },
            context,
            material,
          })
        }
        deepened.push(next)
      } catch (err) {
        console.warn(`[material] falha ao aprofundar "${item.titulo}":`, err?.message || err)
        deepened.push(item)
      }
    }
    material = normalizeMaterialStructure({ ...material, revisaoTurbo: deepened })
    shallow = getShallowResumos(material)
  } else if (shallow.length > 0) {
    let enrichPasses = 0
    while (shallow.length > 0 && enrichPasses < 6) {
      enrichPasses += 1
      const batch = shallow.slice(0, 1)
      console.warn(
        `[material] enriquecendo resumo raso (passe ${enrichPasses}): ${batch.map((r) => r.titulo).join(', ')}`,
      )
      notify(`Aprofundando: ${batch.map((r) => r.titulo).join(', ')}…`)
      try {
        const patch = await callMaterialPatch(
          generateAiJson,
          { ...generateOptions, useGoogleSearch: true },
          buildEnrichResumosPrompt(batch, context, material),
        )
        const expanded = extractRevisaoTurboItems(patch)
        if (!expanded.length) break
        const byTitle = new Map(expanded.map((r) => [String(r.titulo || '').toLowerCase(), r]))
        const merged = extractRevisaoTurboItems(material).map((item) => {
          const hit = byTitle.get(String(item.titulo || '').toLowerCase())
          if (!hit) return item
          if (plainTextLen(hit.conteudo) > plainTextLen(item.conteudo) || isResumoDeepEnough(hit)) {
            return { ...item, conteudo: hit.conteudo }
          }
          return item
        })
        material = normalizeMaterialStructure({ ...material, revisaoTurbo: merged })
      } catch (err) {
        console.warn('[material] falha ao enriquecer resumos:', err?.message || err)
        break
      }
      shallow = getShallowResumos(material)
    }
  }

  const depth = isMaterialDepthAdequate(material)
  if (!depth.ok) {
    const stillShallow = getShallowResumos(material)
    // Após fases: exige padraoBanca; tolera no máx. 1 resumo ainda raso
    if (!isPadraoBancaAdequate(material) || stillShallow.length > 1) {
      const err = new Error(
        depth.reason ||
          'Revisão Turbo ainda genérica/incompleta. Regenere o material.',
      )
      err.code = 'material_shallow'
      throw err
    }
    console.warn(
      `[material] avisando: ${stillShallow.length} resumo(s) ainda abaixo do ideal: ${stillShallow.map((r) => r.titulo).join(', ')}`,
    )
  }

  return material
}
