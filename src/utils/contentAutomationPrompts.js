/**
 * Prompts para automação global de conteúdo (matéria revisada + incidência).
 */

export function buildMateriaRevisadaAutomationPrompt({
  materia,
  courseName = 'Curso Preparatório',
  banca = '',
  concursoName = '',
  editalText = '',
}) {
  const edital = String(editalText || '').slice(0, 100000)
  return `Você é um especialista em criar conteúdo técnico completo e detalhado para o nosso curso "${courseName}".

CONTEXTO SOMENTE PARA NIVELAMENTO (NÃO CITE ESTES NOMES NO CONTEÚDO FINAL):
${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}MATÉRIA: ${materia}

NUNCA mencione concurso, prefeitura, banca ou órgão no texto. O material deve parecer feito apenas para o curso "${courseName}".

EDITAL DE REFERÊNCIA (BASE COMPLETA):
${edital}${editalText.length > 100000 ? '\n\n[... conteúdo truncado ...]' : ''}

TAREFA CRÍTICA:
Crie um conteúdo técnico COMPLETO e DETALHADO sobre "${materia}" baseado EXCLUSIVAMENTE no edital acima, mas apresentando como material oficial do curso "${courseName}".

REGRAS OBRIGATÓRIAS:
1. Baseie-se SEMPRE e EXCLUSIVAMENTE no conteúdo do edital
2. O conteúdo deve ser técnico, completo e detalhado
3. Inclua leis, artigos, súmulas e jurisprudência relevantes do edital
4. Organize de forma didática
5. Não escreva frases do tipo "para o concurso" / "para a banca"

FORMATO (APENAS JSON):
{
  "titulo": "Título completo da matéria",
  "subtitulo": "Subtítulo opcional",
  "content": "Conteúdo HTML formatado completo",
  "secoes": [
    { "titulo": "Nome da Seção", "tipo": "lei|sumula|entendimento|conceito", "conteudo": "HTML" }
  ],
  "tags": ["tag1"],
  "referencias": [
    { "titulo": "Fonte", "url": "https://...", "descricao": "opcional" }
  ]
}

Retorne APENAS o JSON válido, sem markdown.`
}

function formatTopicosBlock(topicos = []) {
  return (topicos || [])
    .map((t, i) => {
      if (typeof t === 'string') return `${i + 1}. ${t}`
      return `${i + 1}. ${t.numero ? `${t.numero} - ` : ''}${t.nome || t}`
    })
    .join('\n')
}

const INCIDENCIA_REVISAO_RULES = `INSTRUÇÕES DA REVISÃO (OBRIGATÓRIO):
1. Para CADA tópico, liste assuntos cobrados com probabilidade 10–100%
2. Distribuição realista (alta/média/baixa) — não coloque tudo em 80–100%
3. Ordene da maior para a menor probabilidade
4. Para CADA assunto, escreva uma REVISÃO COMPLETA e DIRETA (mínimo ~120 palavras): o que estudar, artigos/leis/súmulas quando couber, pegadinhas da banca, e por que cai
5. NÃO corte a revisão no meio. NÃO use reticências "..." no lugar do conteúdo
6. NÃO deixe o campo "revisao" curto ou vazio`

/**
 * Prompt de incidência para disciplina inteira (só use se poucos tópicos).
 */
export function buildIncidenciaAutomationPrompt({
  disciplinaNome,
  topicos = [],
  banca = '',
  cargo = '',
  courseName = 'Curso Preparatório',
  editalText = '',
}) {
  const topicosBlock = formatTopicosBlock(topicos)
  const edital = String(editalText || '').slice(0, 40000)

  return `DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })}

Você é especialista em incidência de prova para concursos.

CURSO: ${courseName}
DISCIPLINA: ${disciplinaNome}
BANCA: ${banca || 'NÃO DEFINIDA'}
CARGO: ${cargo || 'NÃO DEFINIDO'}

TÓPICOS DA DISCIPLINA:
${topicosBlock || '(usar edital abaixo)'}

EDITAL BASE:
${edital}${String(editalText || '').length > 40000 ? '\n\n[texto truncado...]' : ''}

TAREFA:
Gere um conteúdo de revisão de incidência focado no que REALMENTE tende a cair.
Cubra TODOS os tópicos listados — nenhum pode faltar.

${INCIDENCIA_REVISAO_RULES}

JSON:
{
  "disciplina": "${disciplinaNome}",
  "banca": "${banca || 'NÃO DEFINIDA'}",
  "cargo": "${cargo || 'NÃO DEFINIDO'}",
  "curso": "${courseName}",
  "analisePorTopico": [
    {
      "topicoNumero": "número",
      "topicoNome": "nome",
      "assuntos": [
        { "assunto": "nome", "probabilidade": 95, "revisao": "revisão completa e longa do que estudar" }
      ]
    }
  ],
  "topAssuntosGerais": [
    { "assunto": "assunto geral", "probabilidade": 95, "revisao": "revisão completa" }
  ],
  "dicasEstudo": ["dica 1", "dica 2"]
}

Retorne APENAS o JSON válido.`
}

/**
 * Prompt de um lote de tópicos (evita truncamento).
 */
export function buildIncidenciaBatchPrompt({
  disciplinaNome,
  topicos = [],
  banca = '',
  cargo = '',
  courseName = 'Curso Preparatório',
  editalText = '',
  batchIndex = 1,
  batchTotal = 1,
}) {
  const topicosBlock = formatTopicosBlock(topicos)
  const edital = String(editalText || '').slice(0, 35000)

  return `DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })}

Você é especialista em incidência de prova para concursos.
Este é o LOTE ${batchIndex}/${batchTotal} da disciplina "${disciplinaNome}".

CURSO: ${courseName}
BANCA: ${banca || 'NÃO DEFINIDA'}
CARGO: ${cargo || 'NÃO DEFINIDO'}

TÓPICOS DESTE LOTE (gere SOMENTE estes):
${topicosBlock}

EDITAL BASE (referência):
${edital}${String(editalText || '').length > 35000 ? '\n\n[texto truncado...]' : ''}

${INCIDENCIA_REVISAO_RULES}

JSON (apenas este lote):
{
  "analisePorTopico": [
    {
      "topicoNumero": "número",
      "topicoNome": "nome",
      "assuntos": [
        { "assunto": "nome", "probabilidade": 85, "revisao": "revisão completa ≥120 palavras" }
      ]
    }
  ]
}

Retorne APENAS o JSON válido, sem markdown.`
}

/**
 * Resumo geral após os lotes.
 */
export function buildIncidenciaResumoPrompt({
  disciplinaNome,
  banca = '',
  cargo = '',
  courseName = 'Curso Preparatório',
  analisePorTopico = [],
}) {
  const preview = (analisePorTopico || [])
    .slice(0, 40)
    .map((t) => {
      const top = (t.assuntos || [])
        .slice(0, 3)
        .map((a) => `${a.assunto} (${a.probabilidade}%)`)
        .join('; ')
      return `- ${t.topicoNumero || ''} ${t.topicoNome}: ${top}`
    })
    .join('\n')

  return `Com base na análise de incidência da disciplina "${disciplinaNome}" (${courseName}, banca ${banca || 'N/D'}, cargo ${cargo || 'N/D'}), gere o RESUMO GERAL.

ASSUNTOS JÁ MAPEADOS:
${preview || '(sem preview)'}

JSON:
{
  "topAssuntosGerais": [
    { "assunto": "assunto transversal mais cobrado", "probabilidade": 95, "revisao": "revisão completa ≥100 palavras" }
  ],
  "dicasEstudo": ["dica prática 1", "dica prática 2", "dica prática 3"]
}

Retorne APENAS o JSON válido.`
}
