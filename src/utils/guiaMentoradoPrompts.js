import {
  CONTEUDO_COMPLETO_DEPTH,
  getConteudoCompletoDepthInstructions,
} from './contentDepthRules'

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
