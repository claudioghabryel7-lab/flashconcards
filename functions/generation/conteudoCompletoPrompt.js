const MIN_TOPICOS_QUENTES = 6
const MAX_TOPICOS_QUENTES = 10
const MIN_QUESTOES = 8
const MIN_PALAVRAS_POR_RESUMO = 220
const MAX_PALAVRAS_POR_RESUMO = 320
const { AI_TEXT_FORMAT_RULES, AI_MATERIAL_FORMAT_RULES } = require('./aiTextFormatting')

function buildConteudoCompletoServerPrompt({
  disciplina = '',
  topicoNome = '',
  topicKey = '',
  banca = '',
  concursoName = '',
  courseName = '',
  editalText = '',
} = {}) {
  const editalSlice = String(editalText || '').slice(0, 10000)
  const nome = topicoNome || topicKey || 'Tópico'

  return `Você é especialista em materiais de concursos públicos. Gere um material COMPLETO, OBJETIVO e EQUILIBRADO (nem curto demais, nem apostolão).

DISCIPLINA: ${disciplina || 'não informada'}
TÓPICO: ${nome}
CHAVE DO TÓPICO: ${topicKey}
BANCA: ${banca || 'não definida'}
CONCURSO: ${concursoName || 'não informado'}
CARGO/CURSO: ${courseName || 'não informado'}

EDITAL (trecho):
${editalSlice}

RETORNE APENAS UM JSON VÁLIDO E COMPLETO (sem markdown, sem texto fora do JSON):

{
  "titulo": "Material de Apoio Completo: ${nome}",
  "materia": "${nome}",
  "subtitulo": "Revisão estratégica para ${concursoName || 'o concurso'}",
  "numero": "${topicKey}",
  "raioXProbabilidade": {
    "topicosQuentes": ["assunto 1", "assunto 2", "... ${MIN_TOPICOS_QUENTES} a ${MAX_TOPICOS_QUENTES} itens"],
    "padraoBanca": "<p>Como a banca ${banca || 'definida'} costuma cobrar este tópico</p>"
  },
  "revisaoTurbo": [
    {
      "titulo": "Nome do assunto quente 1",
      "conteudo": "<h4>Conceito central</h4><p>Resumo objetivo (~${MIN_PALAVRAS_POR_RESUMO}–${MAX_PALAVRAS_POR_RESUMO} palavras) com <p>, <b>, <mark> e listas</p>"
    }
  ],
  "pegadinhas": [
    {
      "titulo": "Cuidado, Caçapa!",
      "conteudo": "<p>Pegadinha direta da banca (50–90 palavras)</p>"
    }
  ],
  "questoesPreditivas": [
    {
      "enunciado": "Texto da questão",
      "alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" },
      "correta": "A",
      "gabaritoComentado": "<p>Explicação fundamentada e objetiva</p>"
    }
  ]
}

REGRAS OBRIGATÓRIAS:
1. raioXProbabilidade.topicosQuentes: entre ${MIN_TOPICOS_QUENTES} e ${MAX_TOPICOS_QUENTES} (prefira ${MIN_TOPICOS_QUENTES}–8).
2. revisaoTurbo: UM resumo para CADA assunto quente (mesma quantidade).
3. Cada resumo: ${MIN_PALAVRAS_POR_RESUMO}–${MAX_PALAVRAS_POR_RESUMO} palavras (meta ~270). Sem encher linguiça.
4. pegadinhas: 3 a 5 itens objetivos.
5. questoesPreditivas: EXATAMENTE ${MIN_QUESTOES} questões inéditas.
6. Cite lei/jurisprudência só quando essencial — sem cronologia longa de cada norma.
7. ${AI_MATERIAL_FORMAT_RULES}
8. NÃO corte o JSON no meio. NÃO omita seções.
9. ${AI_TEXT_FORMAT_RULES}
10. Conteúdo técnico, específico do tópico "${nome}" — nada genérico nem excessivo.`
}

module.exports = {
  buildConteudoCompletoServerPrompt,
  MIN_TOPICOS_QUENTES,
  MAX_TOPICOS_QUENTES,
  MIN_QUESTOES,
  MIN_PALAVRAS_POR_RESUMO,
  MAX_PALAVRAS_POR_RESUMO,
}
