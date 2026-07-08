/** Regras padrão para geração silenciosa — economiza tokens e evita texto fora do JSON. */
export const SILENT_JSON_RULES = `
REGRAS OBRIGATÓRIAS DE SAÍDA:
- Responda APENAS com JSON válido (objeto ou array).
- PROIBIDO: markdown, blocos \`\`\`, explicações, saudações, comentários ou qualquer texto fora do JSON.
- PROIBIDO: frases como "Aqui está", "Segue o JSON", "Conforme solicitado".
- Se não puder gerar, retorne {"erro":"motivo curto"} em JSON.
`.trim()

export function appendSilentJsonRules(prompt = '') {
  const base = String(prompt || '').trim()
  if (base.includes('REGRAS OBRIGATÓRIAS DE SAÍDA')) return base
  return `${base}\n\n${SILENT_JSON_RULES}`
}
