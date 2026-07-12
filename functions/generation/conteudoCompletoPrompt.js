const MIN_TOPICOS_QUENTES = 8
const MIN_QUESTOES = 8

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

  return `Você é especialista em materiais de concursos públicos. Gere um material COMPLETO e ESTRUTURADO.

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
    "topicosQuentes": ["assunto 1", "assunto 2", "... mínimo ${MIN_TOPICOS_QUENTES} itens"],
    "padraoBanca": "<p>Como a banca ${banca || 'definida'} costuma cobrar este tópico</p>"
  },
  "revisaoTurbo": [
    {
      "titulo": "Nome do assunto quente 1",
      "conteudo": "<p>Resumo COMPLETO com no mínimo 600 palavras, HTML simples (<p>, <b>, <ul>, <li>)</p>"
    }
  ],
  "pegadinhas": [
    {
      "titulo": "Cuidado, Caçapa!",
      "conteudo": "<p>Pegadinha detalhada da banca</p>"
    }
  ],
  "questoesPreditivas": [
    {
      "enunciado": "Texto da questão",
      "alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" },
      "correta": "A",
      "gabaritoComentado": "<p>Explicação fundamentada</p>"
    }
  ]
}

REGRAS OBRIGATÓRIAS:
1. raioXProbabilidade.topicosQuentes: entre ${MIN_TOPICOS_QUENTES} e 15 assuntos quentes.
2. revisaoTurbo: UM resumo para CADA assunto quente do Raio-X (mesma quantidade).
3. pegadinhas: 4 a 6 itens detalhados.
4. questoesPreditivas: EXATAMENTE ${MIN_QUESTOES} questões inéditas.
5. Use HTML simples nos campos de texto (conteudo, padraoBanca, gabaritoComentado).
6. NÃO corte o JSON no meio. NÃO omita seções.
7. Conteúdo técnico, denso e específico do tópico "${nome}" — nada genérico.`
}

module.exports = {
  buildConteudoCompletoServerPrompt,
  MIN_TOPICOS_QUENTES,
  MIN_QUESTOES,
}
