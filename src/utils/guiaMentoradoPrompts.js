import {
  CONTEUDO_COMPLETO_DEPTH,
  getConteudoCompletoDepthInstructions,
} from './contentDepthRules'

import { DEFAULT_PLANNING_DAYS } from '../constants/guiaMentorado'

export function buildMentoradoCronogramaPrompt({
  today,
  planningEnd,
  config = {},
  editalSummary = [],
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

EDITAL VERTICALIZADO COMPLETO:
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
  editalText = '',
}) {
  const depth = getConteudoCompletoDepthInstructions({ banca, concursoName, courseName })

  return `Gere material de apoio completo (Estudar) para o tópico do edital abaixo.

BANCA: ${banca || 'não definida'}
CONCURSO: ${concursoName || courseName || 'Concurso público'}
CURSO/CARGO: ${courseName || 'Curso preparatório'}
DISCIPLINA: ${disciplina}
TÓPICO: ${topicoNome}
CHAVE DO TÓPICO: ${topicKey}

EDITAL (trecho):
${(editalText || '').slice(0, 10000)}

${depth}

Retorne APENAS JSON válido:
{
  "validacaoArtigo": "artigo/lei/jurisprudência base",
  "titulo": "título do material",
  "materia": "${topicoNome}",
  "subtitulo": "subtítulo opcional",
  "numero": "${topicKey}",
  "raioXProbabilidade": {
    "topicosQuentes": ["assunto 1"],
    "padraoBanca": "padrão da banca"
  },
  "revisaoTurbo": [{ "titulo": "título", "conteudo": "HTML simples longo" }],
  "pegadinhas": [{ "titulo": "título", "conteudo": "pegadinha detalhada" }],
  "questoesPreditivas": [{
    "enunciado": "texto",
    "alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" },
    "correta": "A",
    "gabaritoComentado": "explicação"
  }],
  "content": "conteúdo HTML opcional"
}

REGRAS:
- Gere EXATAMENTE ${CONTEUDO_COMPLETO_DEPTH.MIN_QUESTOES} questões preditivas
- Foco 100% neste tópico — nada genérico
- Sem markdown — apenas HTML simples (<b>, <i>, <p>)
- JSON completo e válido`
}

export function buildMentoradoQuestoesPrompt({
  topicKey,
  topicoNome,
  disciplina,
  banca = '',
  courseName = '',
  cargo = '',
  editalText = '',
  nivel = 1,
  tipoProva = 'ABCD',
}) {
  const altBlock =
    tipoProva === 'Certo/Errado'
      ? `"respostaCorreta": "C"`
      : `"alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" },
      "respostaCorreta": "A"`

  return `Gere questões preditivas para o tópico do edital.

BANCA: ${banca || 'não definida'}
CURSO: ${courseName || 'Curso preparatório'}
CARGO: ${cargo || 'não definido'}
DISCIPLINA: ${disciplina}
TÓPICO: ${topicoNome}
NÍVEL: ${nivel}
TIPO: ${tipoProva}

EDITAL (trecho):
${(editalText || '').slice(0, 10000)}

Retorne APENAS JSON válido:
{
  "disciplina": "${disciplina}",
  "banca": "${banca || ''}",
  "cargo": "${cargo || ''}",
  "curso": "${courseName || ''}",
  "topico": "${topicoNome}",
  "tipoProva": "${tipoProva}",
  "nivel": ${nivel},
  "questoes": [
    {
      "numero": 1,
      "assunto": "assunto",
      "probabilidade": 90,
      "enunciado": "enunciado",
      ${altBlock},
      "explicacao": "gabarito comentado"
    }
  ]
}

REGRAS:
- Gere EXATAMENTE 50 questões
- Estilo da banca ${banca || 'definida'}
- Não use aspas duplas dentro de strings — use aspas simples
- JSON válido e completo`
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
  editalText,
}) {
  return {
    courseId,
    courseName,
    disciplina,
    topicoNome,
    topicoNumero,
    topicKey,
    modulo,
    banca,
    editalText: (editalText || '').slice(0, 12000),
  }
}
