const { buildUnifiedLegalTravas, isLikelyLegalDiscipline } = require('./unifiedLegalTravas')
const { AI_TEXT_FORMAT_RULES, AI_MATERIAL_FORMAT_RULES } = require('./aiTextFormatting')
const { resolveTipoProva } = require('./questoesValidate')

const MIN_TOPICOS_QUENTES = 6
const MAX_TOPICOS_QUENTES = 10
const MIN_QUESTOES = 8
const MIN_PALAVRAS_POR_RESUMO = 220
const MAX_PALAVRAS_POR_RESUMO = 320

function buildMaterialQuestoesBlock(banca = '') {
  const tipoProva = resolveTipoProva(banca)
  if (tipoProva === 'Certo/Errado') {
    return {
      tipoProva,
      example: `{
    "enunciado": "...",
    "correta": "C",
    "gabaritoComentado": "<p>Explicação alinhada ao gabarito</p>"
  }`,
      rules: `- TIPO DE PROVA: Certo/Errado (${banca || 'CESPE/Cebraspe'})
- Gabarito OBRIGATORIAMENTE "C" (certo) ou "E" (errado) no campo "correta" ou "respostaCorreta". Proibido A/B/D.
- Sem alternativas A-E.`,
    }
  }
  return {
    tipoProva: 'ABCD',
    example: `{
    "enunciado": "...",
    "alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" },
    "correta": "A",
    "gabaritoComentado": "<p>Explicação alinhada ao gabarito</p>"
  }`,
    rules: `- TIPO DE PROVA: Múltipla escolha (A-E). Gabarito em "correta" ou "respostaCorreta".`,
  }
}

function buildFlashcardPrompt(meta = {}, batchNumber, totalBatches, cardsInBatch, existingFronts = []) {
  const existingList = existingFronts.length
    ? `\nNÃO repita estas frentes:\n${existingFronts.slice(0, 30).map((f) => `- ${f}`).join('\n')}`
    : ''

  const legalTravas = buildUnifiedLegalTravas({
    banca: meta.banca,
    concursoName: meta.concursoName || meta.courseName,
  })

  const searchRule = isLikelyLegalDiscipline(meta.disciplina)
    ? 'OBRIGATÓRIO: use Google Search antes de cada resposta que cite lei, artigo, súmula ou data. Se não confirmar, NÃO cite número.'
    : 'Use Google Search para fatos específicos, datas e nomenclatura oficial quando necessário.'

  const totalCards = 30

  return `Gere flashcards ESTRATÉGICOS para concurso — apenas o essencial (alta incidência na banca).

${legalTravas}

CURSO: ${meta.courseName || ''}
CARGO: ${meta.cargo || meta.concursoName || meta.courseName || ''}
DISCIPLINA: ${meta.disciplina || ''}
TÓPICO: ${meta.topicoNumero ? `${meta.topicoNumero} - ` : ''}${meta.topicoNome || ''}
MÓDULO: ${meta.modulo || ''}
BANCA: ${meta.banca || 'não informada'}

PRIORIDADE: escolha os ${totalCards} pontos MAIS COBRADOS pela banca ${meta.banca || ''} neste tópico/cargo.
Estilo das perguntas deve refletir como a ${meta.banca || 'banca'} costuma cobrar (objetiva, pegadinhas típicas, jurisprudência quando couber).

TOTAL DO TÓPICO: exatamente ${totalCards} cards (este lote: ${batchNumber}/${totalBatches} — ${cardsInBatch} cards).
${existingList}

EDITAL (trecho):
${(meta.editalText || '').slice(0, 12000)}

${searchRule}

FORMATO — retorne APENAS JSON válido:
{
  "flashcards": [
    { "frente": "pergunta objetiva", "verso": "resposta completa e correta (2-4 frases)", "dificuldade": "fácil|médio|difícil", "prioridade": "alta|média" }
  ]
}

REGRAS:
- ${AI_TEXT_FORMAT_RULES}
- Versos factualmente corretos; zero invenção de lei/artigo.
- Priorize alta incidência (${meta.banca || 'banca'}) — descarte detalhes periféricos.
- Exatamente ${cardsInBatch} cards neste lote.
- Sem markdown fora do JSON.`
}

function buildMaterialPrompt({
  disciplina = '',
  topicoNome = '',
  topicKey = '',
  banca = '',
  concursoName = '',
  courseName = '',
  editalText = '',
} = {}) {
  const nome = topicoNome || topicKey || 'Tópico'
  const editalSlice = String(editalText || '').slice(0, 10000)
  const legalTravas = buildUnifiedLegalTravas({ banca, concursoName: concursoName || courseName })
  const questoesBlock = buildMaterialQuestoesBlock(banca)

  return `Você é especialista em materiais de concursos. Gere material COMPLETO, objetivo e equilibrado.

${legalTravas}

DISCIPLINA: ${disciplina || 'não informada'}
TÓPICO: ${nome}
CHAVE: ${topicKey}
BANCA: ${banca || 'não definida'}
CONCURSO/CARGO: ${concursoName || courseName || 'não informado'}

PRIORIDADE: conteúdo alinhado ao estilo e incidência da banca ${banca || ''} para o cargo acima.

EDITAL (trecho):
${editalSlice}

OBRIGATÓRIO: use Google Search para confirmar leis/artigos citados. Não invente numeração.

Retorne APENAS JSON válido:
{
  "titulo": "Material de Apoio Completo: ${nome}",
  "materia": "${nome}",
  "subtitulo": "Revisão estratégica para ${concursoName || courseName || 'o concurso'}",
  "numero": "${topicKey}",
  "raioXProbabilidade": {
    "topicosQuentes": ["assunto 1", "..."],
    "padraoBanca": "<p>Como a banca cobra este tópico</p>"
  },
  "revisaoTurbo": [{ "titulo": "Assunto", "conteudo": "<p>Resumo ~${MIN_PALAVRAS_POR_RESUMO}-${MAX_PALAVRAS_POR_RESUMO} palavras</p>" }],
  "pegadinhas": [{ "titulo": "Cuidado, Caçapa!", "conteudo": "<p>Pegadinha objetiva</p>" }],
  "questoesPreditivas": [${questoesBlock.example}]
}

REGRAS:
1. topicosQuentes: ${MIN_TOPICOS_QUENTES} a ${MAX_TOPICOS_QUENTES} itens.
2. revisaoTurbo: um resumo por assunto quente.
3. Resumos: ${MIN_PALAVRAS_POR_RESUMO}-${MAX_PALAVRAS_POR_RESUMO} palavras cada.
4. pegadinhas: 3 a 5 itens.
5. questoesPreditivas: EXATAMENTE ${MIN_QUESTOES} questões; gabarito coerente com explicação.
6. ${questoesBlock.rules}
7. ${AI_MATERIAL_FORMAT_RULES}
8. ${AI_TEXT_FORMAT_RULES}
9. JSON completo — não truncar.`
}

function buildMaterialCorePrompt(params = {}) {
  const {
    disciplina = '',
    topicoNome = '',
    topicKey = '',
    banca = '',
    concursoName = '',
    courseName = '',
    cargo = '',
    editalText = '',
  } = params
  const nome = topicoNome || topicKey || 'Tópico'
  const editalSlice = String(editalText || '').slice(0, 10000)
  const legalTravas = buildUnifiedLegalTravas({ banca, concursoName: concursoName || courseName })

  return `Gere a PARTE 1 (núcleo) do material de concurso — Raio-X + Revisão Turbo.

${legalTravas}

DISCIPLINA: ${disciplina || 'não informada'}
TÓPICO: ${nome}
CHAVE: ${topicKey}
BANCA: ${banca || 'não definida'}
CARGO: ${cargo || concursoName || courseName || 'não informado'}

PRIORIDADE: alta incidência na banca ${banca || ''} para o cargo acima.

EDITAL (trecho):
${editalSlice}

OBRIGATÓRIO: use Google Search para confirmar leis/artigos citados.

Retorne APENAS JSON válido:
{
  "titulo": "Material de Apoio Completo: ${nome}",
  "materia": "${nome}",
  "subtitulo": "Revisão estratégica para ${concursoName || courseName || 'o concurso'}",
  "numero": "${topicKey}",
  "raioXProbabilidade": {
    "topicosQuentes": ["assunto 1", "..."],
    "padraoBanca": "<p>Como a banca cobra este tópico</p>"
  },
  "revisaoTurbo": [{ "titulo": "Assunto", "conteudo": "<p>Resumo ~${MIN_PALAVRAS_POR_RESUMO}-${MAX_PALAVRAS_POR_RESUMO} palavras</p>" }]
}

REGRAS:
- topicosQuentes: ${MIN_TOPICOS_QUENTES} a ${MAX_TOPICOS_QUENTES} itens.
- revisaoTurbo: um resumo por assunto quente.
- Resumos: ${MIN_PALAVRAS_POR_RESUMO}-${MAX_PALAVRAS_POR_RESUMO} palavras cada.
- ${AI_MATERIAL_FORMAT_RULES}
- ${AI_TEXT_FORMAT_RULES}
- NÃO inclua pegadinhas nem questoesPreditivas nesta fase.`
}

function buildMaterialExtrasPrompt(params = {}, coreSummary = '') {
  const {
    disciplina = '',
    topicoNome = '',
    topicKey = '',
    banca = '',
    concursoName = '',
    courseName = '',
    cargo = '',
  } = params
  const nome = topicoNome || topicKey || 'Tópico'
  const legalTravas = buildUnifiedLegalTravas({ banca, concursoName: concursoName || courseName })
  const questoesBlock = buildMaterialQuestoesBlock(banca)

  return `Gere a PARTE 2 (complemento) do material — pegadinhas + questões preditivas embutidas.

${legalTravas}

DISCIPLINA: ${disciplina || ''}
TÓPICO: ${nome}
BANCA: ${banca || 'não definida'}
CARGO: ${cargo || concursoName || courseName || ''}

MATERIAL JÁ GERADO (parte 1 — use como base, não contradiga):
${String(coreSummary || '').slice(0, 12000)}

OBRIGATÓRIO: use Google Search. Gabarito e explicação alinhados.

Retorne APENAS JSON válido:
{
  "pegadinhas": [{ "titulo": "Cuidado, Caçapa!", "conteudo": "<p>Pegadinha objetiva</p>" }],
  "questoesPreditivas": [${questoesBlock.example}]
}

REGRAS:
- pegadinhas: 3 a 5 itens.
- questoesPreditivas: EXATAMENTE ${MIN_QUESTOES} questões.
- ${questoesBlock.rules}
- ${AI_MATERIAL_FORMAT_RULES}
- ${AI_TEXT_FORMAT_RULES}`
}

function buildQuestoesBatchPrompt({
  disciplina = '',
  topicoNome = '',
  topicKey = '',
  banca = '',
  concursoName = '',
  cargo = '',
  editalText = '',
  nivel = 1,
  maxNivel = 10,
  batchNumber = 1,
  totalBatches = 5,
  questionsInBatch = 10,
  startNum = 1,
  expectedCount = 50,
  existingEnunciados = [],
} = {}) {
  const base = buildQuestoesPrompt({
    disciplina,
    topicoNome,
    topicKey,
    banca,
    concursoName,
    cargo,
    editalText,
    nivel,
    maxNivel,
    expectedCount: questionsInBatch,
  })

  const existingList = existingEnunciados.length
    ? `\nNÃO repita estes enunciados:\n${existingEnunciados.slice(-20).map((e) => `- ${String(e).slice(0, 120)}`).join('\n')}`
    : ''

  return `${base}

LOTE ${batchNumber}/${totalBatches} — exatamente ${questionsInBatch} questões.
Numere de ${startNum} a ${startNum + questionsInBatch - 1}.
Total do tópico ao final: ${expectedCount} questões.${existingList}`
}

function buildQuestoesPrompt({
  disciplina = '',
  topicoNome = '',
  topicKey = '',
  banca = '',
  concursoName = '',
  cargo = '',
  editalText = '',
  nivel = 1,
  maxNivel = 10,
  expectedCount = 50,
} = {}) {
  const tipoProva = resolveTipoProva(banca)

  const altBlock =
    tipoProva === 'Certo/Errado'
      ? `"respostaCorreta": "C", "explicacao": "explicação alinhada ao gabarito C ou E"`
      : `"alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" }, "respostaCorreta": "A", "explicacao": "explicação alinhada ao gabarito"`

  const dificuldade =
    nivel === 1
      ? 'básicas e diretas'
      : nivel <= 3
        ? 'fáceis a médias'
        : nivel <= 6
          ? 'médias'
          : nivel <= 8
            ? 'avançadas'
            : 'especialista'

  const legalTravas = buildUnifiedLegalTravas({ banca, concursoName: concursoName || cargo })

  return `Gere ${expectedCount} questões preditivas nível ${nivel} (${dificuldade}) para concurso.

${legalTravas}

DISCIPLINA: ${disciplina || ''}
TÓPICO: ${topicoNome || topicKey || ''}
BANCA: ${banca || 'não definida'}
CARGO: ${cargo || concursoName || ''}
TIPO DE PROVA: ${tipoProva}
NÍVEL: ${nivel} de ${maxNivel}

EDITAL:
${(editalText || '').slice(0, 10000)}

OBRIGATÓRIO: use Google Search para confirmar base legal das questões. Gabarito e explicação SEMPRE alinhados.

Retorne APENAS JSON:
{
  "topico": "${topicoNome || topicKey || ''}",
  "nivel": ${nivel},
  "questoes": [
    { "numero": 1, "enunciado": "...", ${altBlock} }
  ]
}

REGRAS:
- Exatamente ${expectedCount} questões numeradas de 1 a ${expectedCount}.
- ${AI_TEXT_FORMAT_RULES}
- Proibido gabarito sem explicação coerente.
- JSON completo.`
}

module.exports = {
  buildFlashcardPrompt,
  buildMaterialPrompt,
  buildMaterialCorePrompt,
  buildMaterialExtrasPrompt,
  buildQuestoesPrompt,
  buildQuestoesBatchPrompt,
}
