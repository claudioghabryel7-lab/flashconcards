import { NextResponse } from 'next/server'
import { createRequire } from 'module'
import { verifyCronSecret } from '@/lib/server/withBackend'

const require = createRequire(import.meta.url)

export const maxDuration = 300

type RouteContext = { params: Promise<{ job: string }> }

export async function GET(request: Request, context: RouteContext) {
  return runCron(request, context)
}

export async function POST(request: Request, context: RouteContext) {
  return runCron(request, context)
}

async function runCron(request: Request, context: RouteContext) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { job } = await context.params

  try {
    const { runCronJob } = require('../../../../../server/api/cronJobs.cjs')
    const result = await runCronJob(job)
    return NextResponse.json({ ok: true, job, result })
  } catch (error) {
    const status = error?.status === 404 ? 404 : 500
    console.error(`[cron/${job}]`, error)
    return NextResponse.json(
      { ok: false, job, error: error instanceof Error ? error.message : 'Erro' },
      { status },
    )
  }
}
