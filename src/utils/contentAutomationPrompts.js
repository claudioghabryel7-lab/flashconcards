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

export function buildIncidenciaAutomationPrompt({
  disciplinaNome,
  topicos = [],
  banca = '',
  cargo = '',
  courseName = 'Curso Preparatório',
  editalText = '',
}) {
  const topicosBlock = (topicos || [])
    .map((t, i) => `${i + 1}. ${t.numero ? `${t.numero} - ` : ''}${t.nome || t}`)
    .join('\n')
  const edital = String(editalText || '').slice(0, 10000)

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

EDITAL BASE (trecho):
${edital}${editalText.length > 10000 ? '\n\n[texto truncado...]' : ''}

TAREFA:
Gere um conteúdo de revisão de incidência focado no que REALMENTE tende a cair.

INSTRUÇÕES:
1. Para cada tópico, liste assuntos cobrados com probabilidade 10–100%
2. Distribuição realista (alta/média/baixa) — não coloque tudo em 80–100%
3. Ordene da maior para a menor probabilidade
4. Para cada assunto, escreva uma REVISÃO direta do que estudar

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
        { "assunto": "nome", "probabilidade": 95, "revisao": "estude X porque cai" }
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
