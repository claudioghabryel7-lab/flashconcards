import { createRequire } from 'module'
import { NextResponse } from 'next/server'

const require = createRequire(import.meta.url)

type HandlerFn = (req: unknown, res: unknown, deps?: Record<string, unknown>) => Promise<void> | void

export async function withBackendHandler(
  handler: HandlerFn,
  request: Request,
  deps?: Record<string, unknown>,
) {
  try {
    const { runHandler } = require('../../../server/api/httpAdapter.cjs') as {
      runHandler: (
        h: HandlerFn,
        req: Request,
        d?: Record<string, unknown>,
      ) => Promise<Response>
    }
    return await runHandler(handler, request, deps)
  } catch (error) {
    console.error('[withBackendHandler]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 },
    )
  }
}

export function verifyCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const auth = request.headers.get('authorization') || ''
  return auth === `Bearer ${expected}`
}
