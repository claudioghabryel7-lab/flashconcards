/** Remove tags HTML para edição em texto simples */
export function stripHtml(html = '') {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Converte texto simples em HTML básico (parágrafos) */
export function textToSimpleHtml(text = '') {
  if (!text) return ''
  if (/<[a-z][\s\S]*>/i.test(text)) return text
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

/** Badge de probabilidade — cor conforme faixa */
export function probabilidadeBadgeClass(prob) {
  const n = Number(prob) || 0
  if (n >= 80) return 'border-red-500/30 bg-red-500/10 text-red-400'
  if (n >= 50) return 'border-orange-500/30 bg-orange-500/10 text-orange-400'
  return 'border-cp-border bg-cp-surface text-cp-muted'
}
