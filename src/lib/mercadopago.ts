/**
 * Helpers Mercado Pago (somente servidor).
 * Access Token NUNCA deve ir para o client.
 */

const MP_API = 'https://api.mercadopago.com'

export function getMercadoPagoAccessToken() {
  const token =
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
    ''
  return String(token).trim()
}

export function getMercadoPagoPublicKey() {
  return String(process.env.VITE_MERCADOPAGO_PUBLIC_KEY || process.env.MERCADOPAGO_PUBLIC_KEY || '').trim()
}

export async function mpFetch(path: string, init: RequestInit = {}) {
  const token = getMercadoPagoAccessToken()
  if (!token) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado no servidor.')
  }
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.message || data?.error || `Mercado Pago HTTP ${res.status}`
    const err = new Error(msg)
    ;(err as Error & { status?: number; body?: unknown }).status = res.status
    ;(err as Error & { status?: number; body?: unknown }).body = data
    throw err
  }
  return data
}

export function siteOrigin(req?: Request) {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || ''
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (req) {
    try {
      return new URL(req.url).origin
    } catch {
      /* ignore */
    }
  }
  return 'https://www.flashconcards.com.br'
}

export function webhookNotificationUrl(req?: Request) {
  const configured = process.env.MERCADOPAGO_WEBHOOK_URL || ''
  if (configured.trim()) return configured.trim()
  // Prefer Next webhook; Cloud Function permanece como fallback legado
  return `${siteOrigin(req)}/api/mercadopago/webhook`
}
