/**
 * Calcula o tempo de leitura estimado de um artigo
 * @param {string} content - Conteúdo HTML do artigo
 * @returns {number} - Tempo estimado em minutos
 */
export const calculateReadingTime = (content) => {
  if (!content) return 1
  
  // Remover tags HTML e pegar apenas texto
  const text = content.replace(/<[^>]*>/g, '').trim()
  
  // Contar palavras (assumindo ~200 palavras por minuto)
  const words = text.split(/\s+/).filter(word => word.length > 0).length
  const minutes = Math.ceil(words / 200)
  
  return Math.max(1, minutes) // Mínimo 1 minuto
}

/**
 * Extrai o nome do concurso mencionado no artigo
 * @param {string} content - Conteúdo do artigo
 * @param {string} title - Título do artigo
 * @returns {string} - Nome do concurso ou string vazia
 */
export const extractCompetitionName = (content, title) => {
  if (!content && !title) return ''
  
  const text = (title + ' ' + (content || '')).toUpperCase()
  
  // Padrões comuns de concursos
  const patterns = [
    /PM[-\s]?([A-Z]{2})/i, // PM-GO, PM GO, PMGO
    /PC[-\s]?([A-Z]{2})/i, // PC-GO, PC GO
    /GCM[-\s]?([A-Z]{2})/i, // GCM-GO
    /POL[ÍI]CIA[-\s]?MILITAR[-\s]?([A-Z]{2})/i,
    /POL[ÍI]CIA[-\s]?CIVIL[-\s]?([A-Z]{2})/i,
    /GUARDA[-\s]?MUNICIPAL[-\s]?([A-Z]{2})/i,
    /([A-Z]{2})[-\s]?PM/i,
    /([A-Z]{2})[-\s]?PC/i,
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const state = match[1] || ''
      const fullMatch = match[0]
      
      // Formatar nome do concurso
      if (fullMatch.includes('PM') || fullMatch.includes('POLÍCIA MILITAR')) {
        return `PM-${state || 'GO'}`
      }
      if (fullMatch.includes('PC') || fullMatch.includes('POLÍCIA CIVIL')) {
        return `PC-${state || 'GO'}`
      }
      if (fullMatch.includes('GCM') || fullMatch.includes('GUARDA MUNICIPAL')) {
        return `GCM-${state || 'GO'}`
      }
    }
  }
  
  // Fallback: procurar por padrões mais genéricos
  const genericPatterns = [
    /CONCURSO[-\s]?([A-Z]{2,})/i,
    /EDITAL[-\s]?([A-Z]{2,})/i,
  ]
  
  for (const pattern of genericPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return ''
}

/**
 * Formata data para exibição
 */
export const formatDate = (timestamp) => {
  if (!timestamp) return 'Data não disponível'
  
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  } catch (err) {
    return 'Data não disponível'
  }
}

