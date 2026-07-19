import { createRequire } from 'module'
import { NextResponse, after } from 'next/server'

export const maxDuration = 300

const require = createRequire(import.meta.url)
const { handleHttpRequest } = require('../../../../../server/backend/httpAdapter.cjs')
const { getHttpHandler } = require('../../../../../server/backend/routeRegistry.cjs')

const BACKGROUND_KICK_SLUGS = new Set(['kick-generation-job'])

async function dispatch(request: Request, slug: string) {
  const handler = getHttpHandler(slug)
  if (!handler) {
    return NextResponse.json({ error: 'Endpoint não encontrado' }, { status: 404 })
  }

  if (BACKGROUND_KICK_SLUGS.has(slug) && request.method === 'POST') {
    const body = await request.clone().json().catch(() => ({}))
    const { userId, jobId } = body || {}
    if (userId && jobId) {
      const { kickGenerationJob } = require('../../../../../functions/generation/generationJobKick')
      after(() =>
        kickGenerationJob(userId, jobId, { wait: true }).catch((err: Error) => {
          console.error('[kick-generation-job background]', err)
        }),
      )
    }
  }

  const result = await handleHttpRequest(handler, request)
  const headers = new Headers()
  for (const [key, value] of Object.entries(result.headers || {})) {
    if (value != null) headers.set(key, String(value))
  }
  if (result.body === null || result.body === undefined) {
    return new NextResponse(null, { status: result.statusCode, headers })
  }
  if (typeof result.body === 'string') {
    return new NextResponse(result.body, { status: result.statusCode, headers })
  }
  return NextResponse.json(result.body, { status: result.statusCode, headers })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 })
}

export async function GET(request: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params
  return dispatch(request, slug.join('/'))
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params
  return dispatch(request, slug.join('/'))
}

export async function HEAD(request: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params
  return dispatch(request, slug.join('/'))
}
