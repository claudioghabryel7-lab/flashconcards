/**
 * Função para buscar conteúdo de um link
 * Tenta extrair o texto do link para usar como contexto na IA
 */

export const fetchLinkContent = async (url) => {
  if (!url || !url.trim()) {
    return null
  }

  try {
    // Validar URL
    const urlObj = new URL(url)
    
    // Tentar buscar o conteúdo usando uma API de proxy ou diretamente
    // Como estamos no frontend, vamos usar uma abordagem que passa o link para a IA
    // A IA do Gemini pode acessar alguns links diretamente
    
    // Por enquanto, retornamos o link para ser usado como contexto
    // Em uma implementação futura, pode-se usar uma Cloud Function para fazer scraping
    return {
      url: url.trim(),
      content: null, // Será extraído pela IA se possível
      fetched: false,
    }
  } catch (error) {
    console.error('Erro ao processar URL:', error)
    return null
  }
}

/**
 * Função para obter o contexto do link para usar na IA
 * Retorna uma string formatada para incluir no prompt da IA
 */
export const getLinkContextForAI = async (referenceLink) => {
  if (!referenceLink || !referenceLink.trim()) {
    return ''
  }

  const linkData = await fetchLinkContent(referenceLink)
  
  if (!linkData) {
    return ''
  }

  // Retornar contexto formatado para a IA
  // A IA do Gemini pode acessar links diretamente em alguns casos
  return `\n\n🔗 LINK DE REFERÊNCIA DO CONCURSO:\n${linkData.url}\n\nIMPORTANTE: Use este link como base principal para todas as informações sobre o concurso. Analise o conteúdo deste link ao gerar questões, temas de redação e responder perguntas. Se possível, acesse o link diretamente para obter informações atualizadas e precisas sobre o concurso.\n\n`
}

