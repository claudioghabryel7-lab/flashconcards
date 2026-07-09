import { getConteudoCompletoDepthInstructions } from './contentDepthRules'

const nowPtBr = () =>
  new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

export function buildConcursoDifficultyPrompt({ concurso, cargo, banca, editalExcerpt = '' }) {
  return `Você é especialista em concursos públicos brasileiros.

CONCURSO: ${concurso}
CARGO: ${cargo}
BANCA: ${banca}
${editalExcerpt ? `\nTRECHO DO EDITAL (se disponível):\n${editalExcerpt.slice(0, 12000)}\n` : ''}

TAREFA: Analise a dificuldade esperada desta prova considerando banca, cargo e perfil do concurso.

Retorne APENAS JSON válido:
{
  "nivelDificuldade": "baixa|media|alta|muito_alta",
  "notaDificuldade": 1,
  "justificativa": "texto explicando por que",
  "estiloBanca": "como a banca costuma cobrar",
  "disciplinasCriticas": ["disciplina 1", "disciplina 2"],
  "recomendacoesEstudo": ["recomendação 1", "recomendação 2"],
  "profundidadeRecomendada": "superficial|intermediaria|avancada|especialista"
}

CRÍTICO: JSON puro, sem markdown.`
}

export function buildConcursoMaterialPrompt({
  concurso,
  cargo,
  banca,
  analiseDificuldade,
  editalExcerpt = '',
  focoMateria = '',
}) {
  const depth = getConteudoCompletoDepthInstructions({
    banca,
    concursoName: concurso,
    courseName: cargo,
  })

  const profundidade = analiseDificuldade?.profundidadeRecomendada || 'avancada'
  const nivel = analiseDificuldade?.nivelDificuldade || 'alta'

  return `Você é um especialista em material de revisão para concursos públicos.

CONCURSO: ${concurso}
CARGO: ${cargo}
BANCA: ${banca}
${focoMateria ? `FOCO DA MATÉRIA: ${focoMateria}\n` : ''}
ANÁLISE DE DIFICULDADE (use para calibrar profundidade):
${JSON.stringify(analiseDificuldade || {}, null, 2)}

Nível detectado: ${nivel} | Profundidade recomendada: ${profundidade}
DATA ATUAL: ${nowPtBr()}

${editalExcerpt ? `EDITAL DE REFERÊNCIA:\n${editalExcerpt.slice(0, 50000)}\n` : 'Sem edital anexado — use conhecimento consolidado sobre o concurso, cargo e banca.'}

${depth}

Gere um MATERIAL DE APOIO COMPLETO no formato "Modo Hacker dos Concursos" adaptado à banca ${banca}.

FORMATO JSON OBRIGATÓRIO:
{
  "titulo": "Título com data/hora no final (DD/MM/AAAA HH:MM)",
  "concurso": "${concurso}",
  "cargo": "${cargo}",
  "banca": "${banca}",
  "analiseDificuldade": { ...mesma estrutura da análise... },
  "raioXProbabilidade": {
    "topicosQuentes": ["assunto 1"],
    "padraoBanca": "descrição detalhada"
  },
  "revisaoTurbo": [
    { "titulo": "título", "conteudo": "texto longo e completo em HTML simples (<b>, <i>, <p>)" }
  ],
  "pegadinhas": [
    { "titulo": "Cuidado, caçapa!", "conteudo": "pegadinha detalhada" }
  ],
  "questoesPreditivas": [
    {
      "enunciado": "texto",
      "alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" },
      "correta": "A",
      "gabaritoComentado": "explicação longa"
    }
  ],
  "planoEstudo": {
    "horasSugeridas": 0,
    "prioridades": ["item 1"],
    "cronogramaSemanal": ["dia 1: ..."]
  }
}

REGRAS:
- Conteúdo fiel à legislação vigente — não invente leis
- Tom técnico, denso e específico para ${concurso} / ${cargo}
- Retorne APENAS JSON válido`
}
