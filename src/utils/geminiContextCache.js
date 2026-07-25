/**
 * Context Caching leve para prefixos estáticos (edital/PDF do chat).
 * Reduz custo de input repetido: paga storage + leitura com desconto.
 *
 * Se a API rejeitar (cota/modelo/mínimo de tokens), falha em silêncio
 * e o caller segue com prompt completo — sem quebrar qualidade.
 */

const cacheByKey = new Map()

function hashPrefix(text = '') {
  let h = 2166136261
  const s = String(text)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

/**
 * Cria ou reutiliza um cachedContent no Gemini.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model - ex.: gemini-3.6-flash
 * @param {string} opts.prefixText - bloco estático (system/edital)
 * @param {string} [opts.ttl='3600s']
 * @returns {Promise<string|null>} nome do cache (cachedContents/...) ou null
 */
export async function getOrCreateGeminiContextCache({
  apiKey,
  model,
  prefixText,
  ttl = '3600s',
}) {
  if (!apiKey || !model || !prefixText) return null

  // Mínimo prático: caches pequenos não compensam
  if (String(prefixText).length < 4000) return null

  const key = `${model}:${hashPrefix(prefixText)}`
  const hit = cacheByKey.get(key)
  if (hit?.name && hit.expiresAt > Date.now()) {
    return hit.name
  }

  try {
    const modelPath = String(model).startsWith('models/') ? model : `models/${model}`
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelPath,
          contents: [{ role: 'user', parts: [{ text: prefixText }] }],
          ttl,
        }),
      },
    )

    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.name) {
      console.warn('[contextCache] create failed:', data.error?.message || res.status)
      return null
    }

    const ttlMs = Number(String(ttl).replace(/s$/, '')) * 1000 || 3600_000
    cacheByKey.set(key, {
      name: data.name,
      expiresAt: Date.now() + Math.max(60_000, ttlMs - 60_000),
    })
    console.log('[contextCache] criado:', data.name)
    return data.name
  } catch (err) {
    console.warn('[contextCache] erro:', err?.message || err)
    return null
  }
}

/**
 * generateContent usando cachedContent + pergunta variável.
 * @returns {Promise<object|null>} resposta JSON da API ou null se falhar
 */
export async function generateWithCachedContext({
  apiKey,
  model,
  cachedContentName,
  userText,
  generationConfig = {},
}) {
  if (!apiKey || !model || !cachedContentName || !userText) return null

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cachedContent: cachedContentName,
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig,
        }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.warn('[contextCache] generate failed:', data.error?.message || res.status)
      return null
    }
    return data
  } catch (err) {
    console.warn('[contextCache] generate error:', err?.message || err)
    return null
  }
}
