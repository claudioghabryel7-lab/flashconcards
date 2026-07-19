import { NextResponse } from 'next/server'

import { verifyAdminRequest } from '@/lib/server/adminAuth'
import { runOpsScan } from '@/lib/server/opsScan'

export const runtime = 'nodejs'
export const maxDuration = 60

function resolveBaseUrl(request: Request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || 'http'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

export async function GET(request: Request) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
  }

  try {
    const scan = await runOpsScan(resolveBaseUrl(request))
    return NextResponse.json(scan)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na varredura'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
