/** Inspeção de Google Search Grounding na resposta Gemini. */

function extractGroundingMetadata(response) {
  const candidate = response?.candidates?.[0]
  return candidate?.groundingMetadata || null
}

function hasGroundingSupport(response) {
  const meta = extractGroundingMetadata(response)
  if (!meta) return false

  const queries = meta.webSearchQueries || []
  if (Array.isArray(queries) && queries.length > 0) return true

  const chunks = meta.groundingChunks || []
  if (Array.isArray(chunks) && chunks.length > 0) return true

  const supports = meta.groundingSupports || []
  if (Array.isArray(supports) && supports.length > 0) return true

  if (meta.searchEntryPoint) return true

  return false
}

module.exports = {
  extractGroundingMetadata,
  hasGroundingSupport,
}
