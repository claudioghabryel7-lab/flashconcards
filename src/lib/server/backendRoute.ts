import { NextResponse, after } from 'next/server'

type HandlerResult = { status?: number; body: unknown }

type BackendHandler = (req: Request) => Promise<HandlerResult>

/** Converte Request Next → pseudo-req compatível com verifyAuthRequest das functions. */
export function toLegacyReq(request: Request, body: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  return {
    method: request.method,
    headers,
    body,
    query: Object.fromEntries(new URL(request.url).searchParams),
  }
}

export function runBackendRoute(handler: BackendHandler, options: { methods?: string[] } = {}) {
  const allowed = options.methods || ['POST']

  async function OPTIONS() {
    return new NextResponse(null, { status: 200 })
  }

  async function POST(request: Request) {
    return dispatch(request, 'POST')
  }

  async function GET(request: Request) {
    return dispatch(request, 'GET')
  }

  async function dispatch(request: Request, method: string) {
    if (!allowed.includes(method)) {
      return NextResponse.json({ error: 'Método não permitido' }, { status: 405 })
    }
    try {
      const result = await handler(request)
      return NextResponse.json(result.body, { status: result.status ?? 200 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro interno'
      const status = (err as { status?: number })?.status || 500
      console.error('[backend-route]', message)
      return NextResponse.json({ error: message }, { status })
    }
  }

  return { OPTIONS, POST, GET }
}

/** Agenda trabalho assíncrono após a resposta (substitui fire-and-forget do GCP). */
export function scheduleBackground(task: () => Promise<unknown>) {
  after(() =>
    task().catch((err) => {
      console.error('[backend-background]', err)
    }),
  )
}
