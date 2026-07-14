export const CONTEUDO_COMPLETO_DEPTH = {
  MIN_TOPICOS_QUENTES: 6,
  MAX_TOPICOS_QUENTES: 10,
  MIN_QUESTOES: 8,
  /** Faixa alvo por resumo da Revisão Turbo — completo sem virar apostolão. */
  MIN_PALAVRAS_POR_RESUMO: 220,
  MAX_PALAVRAS_POR_RESUMO: 320,
  MIN_PALAVRAS_PEGADINHA: 50,
  MAX_PALAVRAS_PEGADINHA: 90,
}

/** Instruções de profundidade: cobre o essencial sem texto excessivo. */
export function getConteudoCompletoDepthInstructions({ banca, concursoName, courseName } = {}) {
  const {
    MIN_TOPICOS_QUENTES,
    MAX_TOPICOS_QUENTES,
    MIN_QUESTOES,
    MIN_PALAVRAS_POR_RESUMO,
    MAX_PALAVRAS_POR_RESUMO,
    MIN_PALAVRAS_PEGADINHA,
    MAX_PALAVRAS_PEGADINHA,
  } = CONTEUDO_COMPLETO_DEPTH

  return `
⚖️ PROFUNDIDADE EQUILIBRADA — COMPLETO, OBJETIVO E SEM ENCHER LINGUIÇA:

1. PROIBIDO material superficial/telegráfico. Também PROIBIDO texto excessivo, repetitivo ou "apostolão".
2. Cubra o que realmente cai na banca ${banca || 'definida'} para ${concursoName || 'o concurso'} / cargo ${courseName || 'mencionado'}.
3. Raio-X: entre ${MIN_TOPICOS_QUENTES} e ${MAX_TOPICOS_QUENTES} "Top Assuntos Quentes" (prefira ${MIN_TOPICOS_QUENTES}–8; só chegue a ${MAX_TOPICOS_QUENTES} se a disciplina for muito ampla).
4. Revisão Turbo: UM bloco para CADA assunto quente — sem pular nenhum.
5. Cada bloco da Revisão Turbo: entre ${MIN_PALAVRAS_POR_RESUMO} e ${MAX_PALAVRAS_POR_RESUMO} palavras (meta ~270). Inclua:
   - conceito técnico claro
   - artigo/lei/jurisprudência só quando essencial (sem cronologia longa de cada norma)
   - 1 exemplo prático do concurso
   - 1 dica de memorização concreta
6. Pegadinhas: 3 a 5 itens; cada um com ${MIN_PALAVRAS_PEGADINHA}–${MAX_PALAVRAS_PEGADINHA} palavras (direto ao ponto).
7. Questões Preditivas: EXATAMENTE ${MIN_QUESTOES}; gabarito comentado fundamentado mas objetivo (não dissertação).
8. NÃO corte frases no meio. NÃO omita seções. NÃO invente leis.
9. Se precisar escolher: priorize cobrir TODOS os assuntos quentes com profundidade média — nunca alongue um resumo passando de ~${MAX_PALAVRAS_POR_RESUMO} palavras.
10. Formato HTML: <p>, <h4>, <b>, <mark>, <ul><li>. Sem markdown.`
}
