/** Regras padrão para geração silenciosa — economiza tokens e evita texto fora do JSON. */
export const SILENT_JSON_RULES = `
REGRAS OBRIGATÓRIAS DE SAÍDA:
- Responda APENAS com JSON válido (objeto ou array).
- PROIBIDO: markdown, blocos \`\`\`, explicações, saudações, comentários ou qualquer texto fora do JSON.
- PROIBIDO: frases como "Aqui está", "Segue o JSON", "Conforme solicitado".
- Se não puder gerar, retorne {"erro":"motivo curto"} em JSON.
`.trim()

/**
 * Uma passagem: gera + Google Search + auto-checagem.
 * Máxima economia (sem 2ª chamada de auditoria).
 */
export const SEARCH_GROUNDED_GENERATION_RULES = `
═══ VERIFICAÇÃO COM GOOGLE SEARCH (OBRIGATÓRIA NESTA ÚNICA PASSAGEM) ═══
1. Use Google Search em fontes oficiais/confiáveis enquanto gera.
2. Para CADA afirmação relevante, pergunte mentalmente: "isso aqui está certo mesmo?".
3. Se Search confirmar → inclua.
4. Se encontrar FALSO claro → CORRIJA antes de incluir (ou omita o item).
5. Dúvida FACTUAL (lei/artigo/data/fato) → NÃO inclua o item (descarte).
6. Dúvida só de estilo/redação → mantenha.
7. Nunca invente lei, artigo, súmula, jurisprudência ou data.
8. Prefira menos itens corretos a muitos itens duvidosos.
`.trim()

export function appendSilentJsonRules(prompt = '') {
  const base = String(prompt || '').trim()
  if (base.includes('REGRAS OBRIGATÓRIAS DE SAÍDA')) return base
  return `${base}\n\n${SILENT_JSON_RULES}`
}

export function appendSearchGroundedRules(prompt = '') {
  const base = String(prompt || '').trim()
  if (base.includes('VERIFICAÇÃO COM GOOGLE SEARCH')) return base
  return `${base}\n\n${SEARCH_GROUNDED_GENERATION_RULES}`
}
