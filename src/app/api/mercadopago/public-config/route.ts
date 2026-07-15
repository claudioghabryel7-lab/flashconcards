import { NextResponse } from 'next/server'

/**
 * Public key do Mercado Pago — served same-origin (sem Cloud Functions / CORS / Rate exceeded).
 * A public key é pública por design; produção usa APP_USR-*.
 */
const PROD_PUBLIC_KEY = 'APP_USR-50ae2194-2dfd-410d-9c64-a784280de4b6'

function resolvePublicKey(host: string | null) {
  const envKey =
    process.env.MERCADOPAGO_PUBLIC_KEY_PROD ||
    process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ||
    ''
  const envMode = String(process.env.MERCADOPAGO_MODE || process.env.NEXT_PUBLIC_MERCADOPAGO_MODE || '')
    .toLowerCase()
  const isFlashHost = Boolean(host && /flashconcards\.com(\.br)?$/i.test(host.replace(/:\d+$/, '')))

  // Site de produção sempre usa chave APP_USR (mesmo se .env local estiver em test)
  if (isFlashHost) {
    if (envKey.startsWith('APP_USR-')) return { publicKey: envKey, testMode: false }
    return { publicKey: PROD_PUBLIC_KEY, testMode: false }
  }

  if (envMode === 'prod' || envMode === 'production') {
    return {
      publicKey: envKey.startsWith('APP_USR-') ? envKey : PROD_PUBLIC_KEY,
      testMode: false,
    }
  }

  if (envKey) {
    return { publicKey: envKey, testMode: envKey.startsWith('TEST-') || envMode === 'test' }
  }

  return { publicKey: PROD_PUBLIC_KEY, testMode: false }
}

export async function GET(request: Request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const { publicKey, testMode } = resolvePublicKey(host)
  if (!publicKey) {
    return NextResponse.json(
      { error: 'Public key ausente', message: 'Configure MERCADOPAGO_PUBLIC_KEY_PROD.' },
      { status: 500 },
    )
  }
  return NextResponse.json({ publicKey, testMode, locale: 'pt-BR' })
}

export async function POST(request: Request) {
  return GET(request)
}
