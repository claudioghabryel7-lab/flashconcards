const SESSION_HOURS = 8
const INTERVAL_MINUTES = 5
const REVIEW_COOLDOWN_DAYS = 3
const MIN_CONFIDENCE_AUTO_APPLY = 0.78

const PROFESSOR_ROLES = {
  1: {
    name: 'Professor 1 — Fiscalização',
    instruction: `Você é professor de cursinho preparatório para concursos. Analise o conteúdo com rigor.
Identifique erros factuais, lacunas, textos fracos ou fora do edital. Use tom de cursinho (objetivo, técnico, completo).
Cite apenas o que está no material fornecido e nas fontes. Não invente legislação.`,
  },
  2: {
    name: 'Professor 2 — Revisão da correção',
    instruction: `Você revisa a análise do Professor 1. Corrija correções erradas ou superficiais.
Mantenha padrão de cursinho. Se a correção do P1 estiver certa, confirme. Se estiver errada, ajuste.`,
  },
  3: {
    name: 'Professor 3 — Veredito final',
    instruction: `Veredito final de cursinho. Consolide P1 e P2. Só proponha correções com alta confiança.
Se houver dúvida factual ou conflito entre fontes, marque needsAdminReview: true.`,
  },
}

const REVIEW_JSON_SCHEMA = `Retorne APENAS JSON válido:
{
  "issues": [{ "type": "factual|incomplete|weak|structure", "detail": "...", "target": "flashcards|material|questoes|vespera|redacao" }],
  "corrections": [{ "target": "material|flashcard|questao|vespera|redacao", "refId": "id ou índice", "field": "campo do schema real", "newText": "texto corrigido", "confidence": 0.0 }],
  "confidence": 0.0,
  "needsAdminReview": false,
  "summary": "resumo curto"
}
Campos válidos por target:
- flashcard: frente | verso | ambos
- questao: correta | gabaritoComentado | enunciado | alternativas.A | alternativas.B | alternativas.C | alternativas.D | alternativas.E
- material: materia
Se houver erro concreto, corrections NÃO pode ficar vazio — o sistema aplica newText no Firestore.`

module.exports = {
  SESSION_HOURS,
  INTERVAL_MINUTES,
  REVIEW_COOLDOWN_DAYS,
  MIN_CONFIDENCE_AUTO_APPLY,
  PROFESSOR_ROLES,
  REVIEW_JSON_SCHEMA,
}
