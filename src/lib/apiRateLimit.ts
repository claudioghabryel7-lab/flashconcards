/**
 * Rate limit simples em memória para rotas /api que chamam Gemini.
 * Não substitui auth — só freia abuso/loop.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export function checkApiRateLimit(
  key: string,
  { limit = 20, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const cur = buckets.get(key)
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }
  if (cur.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) }
  }
  cur.count += 1
  return { ok: true }
}

export function clientKeyFromRequest(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for') || ''
  const ip = fwd.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  return ip
}
