import { withBackendHandler } from './withBackend'

type HandlerFn = (req: unknown, res: unknown, deps?: Record<string, unknown>) => Promise<void> | void

export function backendRoute(handler: HandlerFn, deps?: Record<string, unknown>) {
  return async function POST(request: Request) {
    return withBackendHandler(handler, request, deps)
  }
}

export function backendGetPost(handler: HandlerFn, deps?: Record<string, unknown>) {
  const run = backendRoute(handler, deps)
  return { POST: run, GET: run }
}
