const SESSION_HOURS = 8
const INTERVAL_MINUTES = 5
const REVIEW_COOLDOWN_DAYS = 3
const MIN_CONFIDENCE_AUTO_APPLY = 0.78

const PROFESSOR_ROLES = {
  1: {
    name: 'Professor 1 — Fiscalização',
    instruction: `Você é professor de cursinho preparatório para concursos. Analise o conteúdo com rigor.
Identifique APENAS erros factuais reais, lacunas graves ou contradições com o edital/fonte.
Se o conteúdo estiver correto, diga isso claramente: corrections=[], issues=[], reportValid=false.
Não invente erro. Não reescreva por estilo. Cite apenas o que está no material fornecido.`,
  },
  2: {
    name: 'Professor 2 — Revisão da correção',
    instruction: `Você revisa a análise do Professor 1.
Se P1 inventou erro ou propôs correção desnecessária, remova (corrections=[], reportValid=false).
Só mantenha correções com erro factual claro.`,
  },
  3: {
    name: 'Professor 3 — Veredito final',
    instruction: `Veredito final de cursinho. Consolide P1 e P2.
Na dúvida, NÃO altere o conteúdo (corrections=[], reportValid=false ou needsAdminReview:true).
Só proponha correções com alta confiança e newText diferente do atual.`,
  },
}

const REVIEW_JSON_SCHEMA = `Retorne APENAS JSON válido:
{
  "issues": [{ "type": "factual|incomplete|weak|structure", "detail": "...", "target": "flashcards|material|questoes|vespera|redacao" }],
  "corrections": [{ "target": "material|flashcard|questao|vespera|redacao", "refId": "id ou índice", "field": "campo do schema real", "newText": "texto corrigido", "confidence": 0.0 }],
  "confidence": 0.0,
  "needsAdminReview": false,
  "summary": "resumo curto",
  "reportValid": true
}
Regras:
- Se o conteúdo estiver CORRETO (relato do aluno equivocado ou sem erro real): corrections=[], issues=[], reportValid=false, summary explicando que está ok.
- NÃO invente erro. NÃO “melhore” texto só por preferência de estilo.
- Só corrija se houver erro concreto no CONTEÚDO INTEGRAL alinhado ao RELATO.
- Campos válidos:
  flashcard: frente | verso | ambos
  questao: correta | gabaritoComentado | enunciado | alternativas.A | alternativas.B | alternativas.C | alternativas.D | alternativas.E
  material: path do bloco (revisaoTurbo.N.conteudo | pegadinhas.N.conteudo | secoes.N.conteudo | raioXProbabilidade.padraoBanca | content | questoesPreditivas.N.enunciado|correta|gabaritoComentado). "materia" = título apenas.
- newText deve ser diferente do texto atual.`

module.exports = {
  SESSION_HOURS,
  INTERVAL_MINUTES,
  REVIEW_COOLDOWN_DAYS,
  MIN_CONFIDENCE_AUTO_APPLY,
  PROFESSOR_ROLES,
  REVIEW_JSON_SCHEMA,
}
