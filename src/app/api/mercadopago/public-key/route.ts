import { NextResponse } from 'next/server'
import { readEnv } from '@/lib/env'

export const runtime = 'nodejs'

/** Expõe apenas a Public Key (segura para o browser). */
export async function GET() {
  const publicKey =
    process.env.VITE_MERCADOPAGO_PUBLIC_KEY ||
    process.env.MERCADOPAGO_PUBLIC_KEY ||
    readEnv('VITE_MERCADOPAGO_PUBLIC_KEY') ||
    ''
  return NextResponse.json({
    publicKey: publicKey || null,
    configured: Boolean(publicKey),
  })
}
