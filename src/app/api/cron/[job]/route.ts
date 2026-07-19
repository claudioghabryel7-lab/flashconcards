import { createRequire } from 'module'
import { NextResponse } from 'next/server'

export const maxDuration = 540

const require = createRequire(import.meta.url)
const { runCronJob } = require('../../../../../server/backend/cronJobs.cjs')

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET
  if (!secret) return true
  const auth = request.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}`) return true
  const header = request.headers.get('x-cron-secret')
  return header === secret
}

export async function GET(request: Request, ctx: { params: Promise<{ job: string }> }) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { job } = await ctx.params
  try {
    const result = await runCronJob(job)
    return NextResponse.json(result, { status: result.ok ? 200 : 404 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no cron'
    console.error('[cron]', job, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ job: string }> }) {
  return GET(request, ctx)
}
