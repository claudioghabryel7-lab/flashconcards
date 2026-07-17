import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Evita indexação do domínio *.vercel.app (favicon/logo da Vercel nos resultados do Google). */
export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') || '').toLowerCase()
  if (host.endsWith('.vercel.app')) {
    const response = NextResponse.next()
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return response
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
