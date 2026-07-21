import { stripHtml } from './htmlTextHelpers.js'

export const CONTEUDO_COMPLETO_DEPTH = {
  MIN_TOPICOS_QUENTES: 6,
  MAX_TOPICOS_QUENTES: 10,
  MIN_QUESTOES: 8,
  /** Faixa por resumo — aprofundado, com expansão em lotes se o 1º JSON vier raso. */
  MIN_PALAVRAS_POR_RESUMO: 180,
  MAX_PALAVRAS_POR_RESUMO: 280,
  MIN_PALAVRAS_PEGADINHA: 50,
  MAX_PALAVRAS_PEGADINHA: 90,
  /** Texto útil mínimo (sem HTML) para contar um resumo como presente. */
  MIN_CHARS_RESUMO_UTIL: 120,
  /** Texto útil mínimo para considerar o resumo com profundidade adequada. */
  MIN_CHARS_RESUMO_PROFUNDO: 520,
  /** padraoBanca mínimo (sem HTML) — deve explicar como a banca cobra. */
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

1. PROIBIDO resumo raso/telegráfico. Também PROIBIDO "apostolão" genérico sem foco na banca.
2. Cubra o que realmente cai na banca ${bancaLabel} para ${concursoName || 'o concurso'} / cargo ${cargoLabel}.
3. Raio-X: EXATAMENTE ${MIN_TOPICOS_QUENTES} "Top Assuntos Quentes" (até ${MAX_TOPICOS_QUENTES} só se a disciplina for muito ampla).
4. PADRÃO DA BANCA (campo raioXProbabilidade.padraoBanca) — OBRIGATÓRIO e DETALHADO (${MIN_PALAVRAS_PADRAO_BANCA}–${MAX_PALAVRAS_PADRAO_BANCA} palavras em HTML):
   - Como a ${bancaLabel} formula questões DESTE tópico para o cargo ${cargoLabel}
   - O que mais cobra (literalidade de lei, interpretação, jurisprudência, cálculo, etc.)
   - Verbos/estruturas típicas do enunciado
   - 2–3 pegadinhas recorrentes da banca neste assunto
   - 1 exemplo concreto de como a questão costuma aparecer
   - O que a banca NÃO costuma cobrar aqui
   Use <h4>, <p>, <ul><li>, <b>, <mark>. NÃO escreva uma frase única genérica.
5. Revisão Turbo: EXATAMENTE ${MIN_TOPICOS_QUENTES} blocos — UM para CADA assunto quente, na mesma ordem.
6. Cada bloco da Revisão Turbo: ${MIN_PALAVRAS_POR_RESUMO}–${MAX_PALAVRAS_POR_RESUMO} palavras (meta ~220). Estrutura obrigatória:
   - <h4>Conceito central</h4> + desenvolvimento técnico
   - base normativa essencial (artigo/lei/jurisprudência) quando couber
   - <h4>Na prática da banca</h4> — como a ${bancaLabel} cobra ESTE ponto no cargo ${cargoLabel}
   - 1 exemplo prático
   - <h4>Dica de memorização</h4>
7. Pegadinhas: 3 a 5 itens; cada um com ${MIN_PALAVRAS_PEGADINHA}–${MAX_PALAVRAS_PEGADINHA} palavras (armadilha típica da ${bancaLabel}).
8. Questões Preditivas: EXATAMENTE ${MIN_QUESTOES}; gabarito comentado fundamentado.
9. NÃO corte frases. NÃO omita o padrão da banca. NÃO invente leis.
10. Formato HTML: <p>, <h4>, <b>, <mark>, <ul><li>. Sem markdown.
11. revisaoTurbo = ARRAY com ${MIN_TOPICOS_QUENTES} objetos { "titulo", "conteudo" }.`
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

export function getShallowResumos(parsed = {}) {
  return extractRevisaoTurboItems(parsed).filter(
    (r) => plainTextLen(r.conteudo) < CONTEUDO_COMPLETO_DEPTH.MIN_CHARS_RESUMO_PROFUNDO,
  )
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
      reason: `${shallow.length} resumo(s) ainda rasos demais (faltam conceito + prática da banca).`,
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

  return `O material JSON ficou INCOMPLETO: revisaoTurbo tem só ${usable} resumo(s) (mínimo: ${needed}).

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
    { "titulo": "assunto", "conteudo": "<h4>Conceito central</h4><p>...</p><h4>Na prática da banca</h4><p>...</p><h4>Dica de memorização</h4><p>...</p>" }
  ]
}

REGRAS:
- EXATAMENTE ${missing} novos itens.
- Cada conteudo: ${CONTEUDO_COMPLETO_DEPTH.MIN_PALAVRAS_POR_RESUMO}–${CONTEUDO_COMPLETO_DEPTH.MAX_PALAVRAS_POR_RESUMO} palavras.
- Inclua obrigatoriamente a seção "Na prática da banca" (como a ${banca} cobra no cargo ${cargo}).
- Sem markdown. Sem inventar leis.`
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

  const itemsBlock = batch
    .map(
      (r, i) => `### Item ${i + 1}
Título: ${r.titulo}
Conteúdo atual (expandir, não encolher):
${String(r.conteudo || '').slice(0, 1200)}`,
    )
    .join('\n\n')

  return `Expanda os resumos abaixo. Estão rasos demais para estudo de concurso.

TÓPICO: ${topico}
BANCA: ${banca}
CARGO: ${cargo}

${itemsBlock}

Gere APENAS JSON:
{
  "revisaoTurbo": [
    { "titulo": "mesmo título", "conteudo": "<h4>Conceito central</h4><p>...</p><h4>Na prática da banca</h4><p>como a ${banca} cobra...</p><h4>Dica de memorização</h4><p>...</p>" }
  ]
}

REGRAS:
- Mantenha os MESMOS títulos, na mesma ordem
- Cada conteudo: ${CONTEUDO_COMPLETO_DEPTH.MIN_PALAVRAS_POR_RESUMO}–${CONTEUDO_COMPLETO_DEPTH.MAX_PALAVRAS_POR_RESUMO} palavras
- Obrigatório: seção "Na prática da banca" específica da ${banca} / cargo ${cargo}
- Aprofunde conceito + base normativa essencial + exemplo
- Sem markdown. Sem inventar leis.`
}

async function callMaterialPatch(generateAiJson, generateOptions, prompt) {
  return generateAiJson(prompt, {
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
}

/**
 * Garante material completo E com profundidade (padrão da banca + resumos).
 */
export async function ensureMaterialContentComplete(
  parsed,
  { generateAiJson, generateOptions = {}, context = {}, maxRepairs = 2, enrichDepth = true } = {},
) {
  let material = normalizeMaterialStructure(parsed)
  let check = isMaterialContentComplete(material)

  if (!check.ok && typeof generateAiJson !== 'function') {
    const err = new Error(check.reason || 'Material incompleto.')
    err.code = 'material_incomplete'
    throw err
  }

  // 1) Completar quantidade de resumos
  for (let attempt = 0; attempt < maxRepairs && !check.ok; attempt += 1) {
    const missing = Math.max((check.needed || CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES) - (check.usable || 0), 1)
    console.warn(
      `[material] incompleto (${check.usable}/${check.needed}). Reparo ${attempt + 1}/${maxRepairs} (+${missing} resumos)...`,
    )

    const patch = await callMaterialPatch(
      generateAiJson,
      generateOptions,
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
    try {
      const patch = await callMaterialPatch(
        generateAiJson,
        generateOptions,
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

  // 3) Expandir resumos rasos em lotes de 2
  let shallow = getShallowResumos(material)
  let enrichPasses = 0
  while (shallow.length > 0 && enrichPasses < 3) {
    enrichPasses += 1
    const batch = shallow.slice(0, 2)
    console.warn(
      `[material] enriquecendo ${batch.length} resumo(s) rasos (passe ${enrichPasses}): ${batch.map((r) => r.titulo).join(', ')}`,
    )
    try {
      const patch = await callMaterialPatch(
        generateAiJson,
        generateOptions,
        buildEnrichResumosPrompt(batch, context, material),
      )
      const expanded = extractRevisaoTurboItems(patch)
      if (!expanded.length) break

      const byTitle = new Map(
        expanded.map((r) => [String(r.titulo || '').toLowerCase(), r]),
      )
      const current = extractRevisaoTurboItems(material)
      const merged = current.map((item) => {
        const hit = byTitle.get(String(item.titulo || '').toLowerCase())
        if (!hit) return item
        // Só troca se ficou mais profundo
        if (plainTextLen(hit.conteudo) > plainTextLen(item.conteudo)) {
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

  // Se ainda estiver muito raso no padrão da banca, falha com mensagem clara
  const depth = isMaterialDepthAdequate(material)
  if (!depth.ok && !isPadraoBancaAdequate(material)) {
    const err = new Error(depth.reason || 'Padrão da banca insuficiente.')
    err.code = 'material_shallow'
    throw err
  }

  return material
}
