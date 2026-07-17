/**
 * Utilitários HTTP para Cloud Functions — garante resposta, retry e detecção de erros transitórios.
 */

function isTransientNetworkError(error) {
  if (!error) return false
  const code = String(error.code || '').toUpperCase()
  const msg = String(error.message || error.cause?.[0]?.description || '').toLowerCase()
  const status = error.status || error.statusCode || error.response?.status

  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ESOCKETTIMEDOUT'].includes(code)) {
    return true
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('fetch failed')) {
    return true
  }
  if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('network')) {
    return true
  }
  if (msg.includes('socket') || msg.includes('503') || msg.includes('502') || msg.includes('504')) {
    return true
  }
  if ([408, 429, 500, 502, 503, 504].includes(Number(status))) {
    return true
  }
  return false
}

function isTransientMercadoPagoError(error) {
  if (isTransientNetworkError(error)) return true
  const msg = String(error.message || JSON.stringify(error.cause || {})).toLowerCase()
  if (msg.includes('internal_error') || msg.includes('too_many_requests')) return true
  const code = error.cause?.[0]?.code
  return code === 'internal_error' || code === '503' || code === '429'
}

/**
 * Retry com backoff exponencial + jitter.
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, baseDelayMs?: number, shouldRetry?: (err: unknown, attempt: number) => boolean }} opts
 * @returns {Promise<T>}
 */
async function retryWithBackoff(fn, opts = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    shouldRetry = isTransientNetworkError,
  } = opts

  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
        throw err
      }
      const jitter = Math.floor(Math.random() * 200)
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter
      console.warn(`[retryWithBackoff] tentativa ${attempt}/${maxAttempts} falhou — retry em ${delay}ms:`, err?.message || err)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

/**
 * Envolve handler CORS garantindo resposta HTTP em todos os caminhos (incl. throws não capturados).
 * @param {(req: import('express').Request, res: import('express').Response) => Promise<void>|void} handler
 * @param {import('cors').CorsRequestHandler} corsMiddleware
 */
function wrapCorsHandler(handler, corsMiddleware) {
  return (req, res) => {
    corsMiddleware(req, res, async () => {
      if (res.headersSent) return
      try {
        await handler(req, res)
        if (!res.headersSent) {
          console.error('[httpUtils] handler terminou sem enviar resposta:', req.method, req.path || req.url)
          res.status(500).json({ error: 'Resposta não enviada pelo servidor' })
        }
      } catch (err) {
        console.error('[httpUtils] erro não tratado:', err)
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Erro interno',
            message: err?.message || 'Erro desconhecido',
          })
        }
      }
    })
  }
}

module.exports = {
  isTransientNetworkError,
  isTransientMercadoPagoError,
  retryWithBackoff,
  wrapCorsHandler,
}
