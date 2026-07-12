export const CONTEUDO_COMPLETO_DEPTH = {
  MIN_TOPICOS_QUENTES: 8,
  MAX_TOPICOS_QUENTES: 15,
  MIN_QUESTOES: 8,
  MIN_PALAVRAS_POR_RESUMO: 600,
}

/** Instruções reforçadas para evitar material superficial ou truncado. */
export function getConteudoCompletoDepthInstructions({ banca, concursoName, courseName } = {}) {
  const { MIN_TOPICOS_QUENTES, MAX_TOPICOS_QUENTES, MIN_QUESTOES, MIN_PALAVRAS_POR_RESUMO } =
    CONTEUDO_COMPLETO_DEPTH

  return `
🚨 PROFUNDIDADE OBRIGATÓRIA — CONTEÚDO FIEL E COMPLETO (NÃO RESUMA):

1. PROIBIDO material superficial, telegráfico ou genérico. Cada seção deve ser técnica, densa e aplicável à banca ${banca || 'definida'}.
2. Raio-X de Probabilidade: gere entre ${MIN_TOPICOS_QUENTES} e ${MAX_TOPICOS_QUENTES} "Top Assuntos Quentes" — quanto maior a disciplina, mais tópicos.
3. Revisão Turbo: UM bloco completo para CADA assunto quente listado no Raio-X (não pule nenhum).
4. Cada bloco da Revisão Turbo deve ter NO MÍNIMO ${MIN_PALAVRAS_POR_RESUMO} palavras, com:
   - conceito técnico desenvolvido (não bullet points vazios)
   - artigos/leis/jurisprudência quando aplicável
   - exemplos práticos do concurso ${concursoName || 'mencionado'} e cargo ${courseName || 'mencionado'}
   - dicas de memorização concretas
5. Pegadinhas: gere 4 a 6 itens detalhados, cada um com explicação completa (mínimo 120 palavras).
6. Questões Preditivas: gere EXATAMENTE ${MIN_QUESTOES} questões inéditas, com gabarito comentado longo e fundamentado.
7. NUNCA corte frases, palavras ou parágrafos no meio — complete todas as ideias até o fim.
8. Se o JSON ficar grande, priorize completar todas as seções obrigatórias em vez de encurtar textos.
9. O material deve parecer um capítulo de apostila premium, não um resumo de uma página.
10. Formate com HTML organizado: parágrafos <p>, subtítulos <h4>, negrito <b>, grifos <mark> em trechos-chave e listas <ul><li>.`
}
