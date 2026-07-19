import { createRequire } from 'module'
import { NextResponse } from 'next/server'

export const maxDuration = 540

const require = createRequire(import.meta.url)
const { processWebhookPayload } = require('../../../../../server/backend/triggerHandlers.cjs')

function authorize(request: Request) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET || process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('x-webhook-secret') === secret
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const payload = await request.json()
    const result = await processWebhookPayload(payload)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no webhook'
    console.error('[supabase-db webhook]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
