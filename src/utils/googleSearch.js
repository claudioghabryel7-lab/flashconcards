/**
 * Google Search API Integration for RAG (Retrieval-Augmented Generation)
 * This module provides search functionality to retrieve up-to-date legal information
 * before generating AI content, preventing hallucinations.
 */

/**
 * Performs a Google Search query and returns the results
 * @param {string} query - The search query
 * @param {number} numResults - Number of results to return (default: 5)
 * @returns {Promise<Array>} - Array of search results with title, snippet, and link
 */
export async function googleSearch(query, numResults = 5) {
  const apiKey = import.meta.env.VITE_GOOGLE_SEARCH_API_KEY
  const searchEngineId = import.meta.env.VITE_GOOGLE_SEARCH_ENGINE_ID

  if (!apiKey || !searchEngineId) {
    console.warn('Google Search API credentials not configured. Skipping search.')
    return []
  }

  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=${numResults}`
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Google Search API error: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.items) {
      return []
    }

    return data.items.map(item => ({
      title: item.title,
      snippet: item.snippet,
      link: item.link,
      displayLink: item.displayLink
    }))
  } catch (error) {
    console.error('Error performing Google Search:', error)
    return []
  }
}

/**
 * Performs a targeted search for legal information
 * Focuses on official Brazilian legal sources (Planalto, STF, STJ, etc.)
 * @param {string} topic - The legal topic to search for
 * @param {number} numResults - Number of results to return (default: 5)
 * @returns {Promise<Array>} - Array of search results
 */
export async function searchLegalInfo(topic, numResults = 5) {
  const legalSites = [
    'site:planalto.gov.br',
    'site:stf.jus.br',
    'site:stj.jus.br',
    'site:legislacao.planalto.gov.br'
  ]
  
  const siteFilter = legalSites.join(' OR ')
  const query = `${topic} ${siteFilter}`
  
  return googleSearch(query, numResults)
}

/**
 * Formats search results into a context string for AI prompts
 * @param {Array} results - Array of search results
 * @returns {string} - Formatted context string
 */
export function formatSearchContext(results) {
  if (!results || results.length === 0) {
    return ''
  }

  let context = '🔍 CONTEXTO DE BUSCA NO GOOGLE (INFORMAÇÕES ATUALIZADAS):\n\n'
  
  results.forEach((result, index) => {
    context += `${index + 1}. **${result.title}**\n`
    context += `   Fonte: ${result.displayLink}\n`
    context += `   Resumo: ${result.snippet}\n`
    context += `   Link: ${result.link}\n\n`
  })

  context += '⚠️ INSTRUÇÃO CRÍTICA: Use APENAS as informações acima para responder. Se a busca não retornar informações relevantes, use seu conhecimento treinado mas cite explicitamente que não há confirmação recente.\n\n'
  
  return context
}

/**
 * Performs RAG (Retrieval-Augmented Generation) by searching and formatting context
 * @param {string} topic - Topic to search for
 * @param {boolean} isLegal - Whether to use legal-specific search
 * @returns {Promise<string>} - Formatted context string for AI prompt
 */
export async function performRAG(topic, isLegal = true) {
  const results = isLegal 
    ? await searchLegalInfo(topic, 5)
    : await googleSearch(topic, 5)
  
  return formatSearchContext(results)
}
