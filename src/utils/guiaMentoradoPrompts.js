import {
  CONTEUDO_COMPLETO_DEPTH,
  getConteudoCompletoDepthInstructions,
} from './contentDepthRules'
import { AI_TEXT_FORMAT_RULES, AI_MATERIAL_FORMAT_RULES } from './aiTextFormatting'
import { DEFAULT_PLANNING_DAYS } from '../constants/guiaMentorado'
import {
  buildExamAwareFlashcardMeta,
  buildExamFidelityBlock,
  buildExamFidelityInline,
  normalizeExamContext,
  resolveTipoProvaFromBanca,
} from './examFidelityContext'

export function buildMentoradoCronogramaPrompt({
  today,
  planningEnd,
  config = {},
  editalSummary = [],
  editalText = '',
  usingDefaultWindow = false,
}) {
  const daysUntilProva = planningEnd.diff(today, 'day')

  return `DATA ATUAL: ${today.format('DD/MM/YYYY')}
DATA FINAL DO PLANEJAMENTO: ${planningEnd.format('DD/MM/YYYY')}
${config.dataProva && !usingDefaultWindow ? `DATA DA PROVA: ${planningEnd.format('DD/MM/YYYY')}` : `MODO SEM DATA DA PROVA: planeje exatamente ${DEFAULT_PLANNING_DAYS} dias de estudo a partir de hoje`}
DIAS DE PLANEJAMENTO: ${daysUntilProva}
TEM TAF: ${config.hasTAF ? 'Sim' : 'Não'}
TEM REDAÇÃO: ${config.hasRedacao ? 'Sim' : 'Não'}
EXERCÍCIOS TAF: ${config.tafExercicios?.join(', ') || 'Nenhum'}

${editalText ? `${editalText}\n\n` : ''}EDITAL VERTICALIZADO (JSON):
${JSON.stringify(editalSummary, null, 2)}

ANÁLISE OBRIGATÓRIA DO EDITAL:
- Você DEVE ler TODAS as matérias listadas acima
- Você DEVE ler TODOS os tópicos de cada matéria
- Conte quantas matérias existem no total
- Conte quantos tópicos existem no total
- Calcule quantos tópicos precisa estudar por dia para cobrir TUDO até a prova
- NÃO pule nenhuma matéria ou tópico

INSTRUÇÕES:
Você é um MENTOR DE ESTUDOS especialista em concursos. Crie um cronograma estratégico do dia atual até o dia da prova.

REGRAS OBRIGATÓRIAS DO MENTOR:
1. TODAS as matérias do edital devem ser contempladas - NÃO PULE NENHUMA MATÉRIA OU TÓPICO
2. TODOS os tópicos de cada matéria devem ser estudados pelo menos uma vez
3. AGRUPE matérias AFINS no mesmo dia (ex: Direito Constitucional + Administrativo + Penal juntos)
4. NÃO misture matérias muito diferentes (ex: NÃO coloque Português + Biologia + Lei X no mesmo dia)
5. Use 3-4 matérias por dia se necessário para acelerar e fechar o edital completo
6. Dias de TAF devem ter estudo também (manhã: TAF, tarde/noite: estudo)
7. Sem dia de descanso (simulado serve como descanso)
8. Reta final: últimos 7 dias apenas revisão/simulado
9. Distribua as matérias de forma ESTRATÉGICA e equilibrada (não sequencial)
10. Priorize matérias mais importantes com mais tempo de estudo
11. OBJETIVO: Fechar TODO o edital 7 dias antes da prova
12. NÃO use Google Search — trabalhe só com o edital acima

RETORNE APENAS ESTE JSON (sem texto adicional):
{
  "cronograma": [
    {
      "data": "YYYY-MM-DD",
      "tipo": "estudo",
      "fase": "fundamentacao",
      "materias": [{"disciplina": "nome", "topico": "nome"}],
      "taf_exercicio": "",
      "descricao": ""
    }
  ]
}

CRÍTICO - NÃO CORTAR O JSON:
- O JSON deve ser COMPLETO e VÁLIDO
- NÃO pare no meio do array cronograma
- Certifique-se de fechar todas as chaves e colchetes

IMPORTANTE:
- Comece em ${today.format('DD/MM/YYYY')}
- Termine em ${planningEnd.format('DD/MM/YYYY')}
- Cada item de materias.disciplina e materias.topico deve bater com nomes do edital
- JSON deve ser válido e completo
- Use aspas duplas
- Não adicione comentários no JSON`
}

export function buildMentoradoConteudoPrompt({
  topicKey,
  topicoNome,
  disciplina,
  banca = '',
  concursoName = '',
  courseName = '',
  cargo = '',
  nivelCurso = '',
  editalText = '',
  ...rest
}) {
  const exam = normalizeExamContext({
    banca,
    concursoName,
    courseName,
    cargo,
    nivel: nivelCurso,
    ...rest,
  })
  const depth = getConteudoCompletoDepthInstructions({
    banca: exam.banca,
    concursoName: exam.concursoName,
    courseName: exam.courseName,
    cargo: exam.cargo,
  })
  const altBlock =
    exam.tipoProva === 'Certo/Errado'
      ? `"correta": "C"`
      : `"alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" },
    "correta": "A"`

  return `${buildExamFidelityBlock(exam)}
Gere material de apoio completo (Estudar) para o tópico do edital abaixo.

${buildExamFidelityInline(exam)}
DISCIPLINA: ${disciplina}
TÓPICO: ${topicoNome}
CHAVE DO TÓPICO: ${topicKey}

EDITAL (trecho):
${(editalText || '').slice(0, 10000)}

${depth}

PRIORIDADE ABSOLUTA: conteúdo cobrado pela banca ${exam.banca} para o cargo ${exam.cargo} neste concurso (${exam.concursoName}).
Nada genérico de outros cargos. Questões embutidas no formato ${exam.tipoProva}.

VERACIDADE (obrigatório):
- Use Google Search e confirme leis/artigos/decretos em fontes oficiais.
- Não invente dispositivo legal. Fato não confirmado → omita.
- Cite a base normativa no validacaoArtigo e no gabarito comentado.

Retorne APENAS JSON válido:
{
  "validacaoArtigo": "artigo/lei/jurisprudência base",
  "titulo": "título do material",
  "materia": "${topicoNome}",
  "subtitulo": "Revisão estratégica — ${exam.cargo || exam.concursoName}",
  "numero": "${topicKey}",
  "banca": "${exam.banca}",
  "cargo": "${exam.cargo}",
  "concurso": "${exam.concursoName}",
  "raioXProbabilidade": {
    "topicosQuentes": ["assunto 1", "assunto 2", "assunto 3", "assunto 4", "assunto 5", "assunto 6"],
    "padraoBanca": "como a ${exam.banca} cobra este tópico para ${exam.cargo}"
  },
  "revisaoTurbo": [
    { "titulo": "assunto 1", "conteudo": "HTML simples (~150 palavras)" },
    { "titulo": "assunto 2", "conteudo": "HTML simples (~150 palavras)" },
    { "titulo": "assunto 3", "conteudo": "HTML simples (~150 palavras)" },
    { "titulo": "assunto 4", "conteudo": "HTML simples (~150 palavras)" },
    { "titulo": "assunto 5", "conteudo": "HTML simples (~150 palavras)" },
    { "titulo": "assunto 6", "conteudo": "HTML simples (~150 palavras)" }
  ],
  "pegadinhas": [{ "titulo": "título", "conteudo": "pegadinha típica da ${exam.banca}" }],
  "questoesPreditivas": [{
    "enunciado": "texto no estilo ${exam.banca}",
    ${altBlock},
    "gabaritoComentado": "explicação"
  }],
  "content": "conteúdo HTML opcional"
}

REGRAS:
- Gere EXATAMENTE ${CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES} itens em revisaoTurbo (um por assunto quente)
- Gere EXATAMENTE ${CONTEUDO_COMPLETO_DEPTH.MIN_QUESTOES} questões preditivas no formato ${exam.tipoProva}
- Campo "correta" obrigatório em cada questão preditiva
- Foco 100% neste tópico + cargo ${exam.cargo} + banca ${exam.banca}
- Sem markdown — apenas HTML (<b>, <i>, <p>, <h4>, <mark>, <ul>, <li>)
- ${AI_MATERIAL_FORMAT_RULES}
- ${AI_TEXT_FORMAT_RULES}
- JSON completo e válido`
}

export function buildMentoradoQuestoesPrompt({
  topicKey,
  topicoNome,
  disciplina,
  banca = '',
  courseName = '',
  cargo = '',
  concursoName = '',
  nivelCurso = '',
  editalText = '',
  nivel = 1,
  tipoProva = '',
  ...rest
}) {
  const exam = normalizeExamContext({
    banca,
    courseName,
    cargo,
    concursoName: concursoName || courseName,
    nivel: nivelCurso,
    tipoProva,
    ...rest,
  })
  const resolvedTipo = tipoProva || exam.tipoProva || resolveTipoProvaFromBanca(exam.banca)
  const altBlock =
    resolvedTipo === 'Certo/Errado'
      ? `"correta": "C"`
      : `"alternativas": { "A": "texto", "B": "texto", "C": "texto", "D": "texto", "E": "texto" },
      "correta": "A"`

  const dificuldadeNivel =
    nivel === 1
      ? 'fundamentos cobrados pela banca para este cargo'
      : nivel <= 3
        ? 'média — padrão da prova'
        : nivel <= 6
          ? 'avançada — pegadinhas da banca'
          : 'elite — cobrança máxima da banca neste cargo'

  const qtd = Number(rest.quantidadeQuestoes) > 0 ? Number(rest.quantidadeQuestoes) : 12

  return `${buildExamFidelityBlock({ ...exam, tipoProva: resolvedTipo })}
Gere questões preditivas CONFIÁVEIS para o tópico do edital.

${buildExamFidelityInline({ ...exam, tipoProva: resolvedTipo })}
DISCIPLINA: ${disciplina}
TÓPICO: ${topicoNome}
NÍVEL DE QUESTÃO: ${nivel} (${dificuldadeNivel})
TIPO: ${resolvedTipo}

EDITAL (trecho):
${(editalText || '').slice(0, 10000)}

OBRIGATÓRIO — VERACIDADE:
1. Use Google Search. Confirme leis, artigos, decretos e jurisprudência em fontes oficiais.
2. NÃO invente número de lei, artigo ou Súmula. Se não confirmar → não use.
3. Cada questão deve ter gabarito objetivamente correto e comentário citando a base legal.
4. Prefira ${qtd} questões 100% corretas a muitas duvidosas.

Retorne APENAS JSON válido:
{
  "disciplina": "${disciplina}",
  "banca": "${exam.banca}",
  "cargo": "${exam.cargo}",
  "concurso": "${exam.concursoName}",
  "curso": "${exam.courseName}",
  "topico": "${topicoNome}",
  "tipoProva": "${resolvedTipo}",
  "nivel": ${nivel},
  "questoes": [
    {
      "numero": 1,
      "assunto": "assunto",
      "probabilidade": 90,
      "enunciado": "enunciado no estilo ${exam.banca} para ${exam.cargo}",
      ${altBlock},
      "gabaritoComentado": "explique por que a correta está certa e cite a base legal"
    }
  ]
}

REGRAS DE FORMATO (CRÍTICO — sem isso a geração FALHA):
- Gere EXATAMENTE ${qtd} questões
- Campo "correta" OBRIGATÓRIO em TODA questão (letra A-E ou C/E)
- alternativas A-E com texto NÃO vazio (se múltipla escolha)
- enunciado com no mínimo 40 caracteres
- Estilo 100% da banca ${exam.banca} (${resolvedTipo})
- Conteúdo 100% alinhado ao cargo ${exam.cargo} no concurso ${exam.concursoName}
- JSON válido e COMPLETO (não corte no meio)`
}

export function buildMentoradoFlashcardMeta({
  courseId,
  courseName,
  disciplina,
  topicoNome,
  topicoNumero,
  topicKey,
  modulo,
  banca,
  cargo = '',
  concursoName = '',
  nivelCurso = '',
  editalText,
  ...rest
}) {
  return buildExamAwareFlashcardMeta(
    {
      courseId,
      courseName,
      disciplina,
      topicoNome,
      topicoNumero,
      topicKey,
      modulo,
      editalText: (editalText || '').slice(0, 12000),
    },
    {
      banca,
      cargo,
      concursoName: concursoName || courseName,
      courseName,
      nivel: nivelCurso,
      ...rest,
    },
  )
}
