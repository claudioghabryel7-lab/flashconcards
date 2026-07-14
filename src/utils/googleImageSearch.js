/**
 * Busca imagens no Google Custom Search (searchType=image).
 */
import { readEnv } from '../lib/env.js'

/**
 * @param {string} query
 * @param {object} [opts]
 * @param {number} [opts.numResults]
 * @param {string} [opts.imgType] photo | clipart | lineart | news | face
 * @param {string} [opts.fileType] png | jpg | ...
 * @param {string} [opts.siteSearch] restringe a um domínio
 */
export async function googleImageSearch(query, opts = {}) {
  const apiKey = readEnv('VITE_GOOGLE_SEARCH_API_KEY')
  const searchEngineId = readEnv('VITE_GOOGLE_SEARCH_ENGINE_ID')
  const numResults = Math.min(Number(opts.numResults) || 6, 10)

  if (!apiKey || !searchEngineId) {
    console.warn('Google Search API credentials not configured. Skipping image search.')
    return []
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx: searchEngineId,
      q: query,
      searchType: 'image',
      num: String(numResults),
      safe: 'active',
    })
    if (opts.imgType) params.set('imgType', opts.imgType)
    if (opts.fileType) params.set('fileType', opts.fileType)
    if (opts.siteSearch) params.set('siteSearch', opts.siteSearch)
    if (opts.imgSize) params.set('imgSize', opts.imgSize)

    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`)
    if (!response.ok) {
      throw new Error(`Google Image Search error: ${response.status}`)
    }

    const data = await response.json()
    if (!data.items?.length) return []

    return data.items.map((item) => ({
      title: item.title || '',
      link: item.link,
      displayLink: item.displayLink || '',
      contextLink: item.image?.contextLink || '',
      width: item.image?.width || 0,
      height: item.image?.height || 0,
      mime: item.mime || '',
    }))
  } catch (error) {
    console.error('Error performing Google Image Search:', error)
    return []
  }
}

export function isLikelyOfficialDomain(displayLink = '') {
  const host = String(displayLink || '')
    .toLowerCase()
    .replace(/^www\./, '')
  return (
    host.endsWith('.gov.br') ||
    host.endsWith('.mil.br') ||
    host.endsWith('.leg.br') ||
    host.includes('gov.br') ||
    host.includes('policia') ||
    host.includes('pm') ||
    host.includes('bombeiro') ||
    host.includes('guarda')
  )
}

/**
 * Ranqueia resultados: domínios oficiais e dimensões úteis primeiro.
 */
export function rankOfficialImageResults(items = []) {
  return [...items].sort((a, b) => {
    const aOff = isLikelyOfficialDomain(a.displayLink) ? 1 : 0
    const bOff = isLikelyOfficialDomain(b.displayLink) ? 1 : 0
    if (aOff !== bOff) return bOff - aOff
    const aArea = (a.width || 0) * (a.height || 0)
    const bArea = (b.width || 0) * (b.height || 0)
    return bArea - aArea
  })
}
