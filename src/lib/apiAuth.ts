/**
 * Autenticação de rotas API via Firebase ID token (Bearer).
 *
 * 1) Preferência: firebase-admin (FIREBASE_SERVICE_ACCOUNT_JSON)
 * 2) Fallback: Identity Toolkit REST com a Web API Key (VITE_FIREBASE_API_KEY)
 *    — não exige service account no Vercel.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getFirebaseAdminApp } from '@/lib/firebaseAdmin'

export type AuthUser = { uid: string; email?: string | null }

function getFirebaseWebApiKey(): string {
  return (
    process.env.FIREBASE_API_KEY ||
    process.env.VITE_FIREBASE_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    ''
  ).trim()
}

/** Valida ID token sem Admin SDK (usa a mesma Web API Key do client). */
async function verifyIdTokenViaRest(idToken: string): Promise<AuthUser | null> {
  const apiKey = getFirebaseWebApiKey()
  if (!apiKey) return null

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  )

  const data = (await response.json().catch(() => ({}))) as {
    users?: Array<{ localId?: string; email?: string }>
    error?: { message?: string }
  }

  if (!response.ok) {
    const msg = String(data?.error?.message || '')
    if (/INVALID_ID_TOKEN|TOKEN_EXPIRED|INVALID_ARGUMENT/i.test(msg)) {
      return null
    }
    console.warn('[apiAuth] Identity Toolkit lookup falhou:', msg || response.status)
    return null
  }

  const user = data?.users?.[0]
  if (!user?.localId) return null
  return { uid: user.localId, email: user.email || null }
}

async function verifyIdToken(idToken: string): Promise<AuthUser | null> {
  // 1) Admin SDK quando houver service account
  const app = getFirebaseAdminApp()
  if (app) {
    try {
      const decoded = await getAuth(app).verifyIdToken(idToken)
      return { uid: decoded.uid, email: decoded.email || null }
    } catch {
      // Token inválido ou Admin mal configurado — tenta REST abaixo
    }
  }

  // 2) Fallback REST (sem service account)
  return verifyIdTokenViaRest(idToken)
}

export async function requireApiAuth(
  request: NextRequest,
): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const header = request.headers.get('authorization') || request.headers.get('Authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) {
    return {
      error: NextResponse.json(
        { error: 'Não autenticado. Faça login e tente novamente.' },
        { status: 401 },
      ),
    }
  }

  const hasAdmin = Boolean(getFirebaseAdminApp())
  const hasWebKey = Boolean(getFirebaseWebApiKey())
  if (!hasAdmin && !hasWebKey) {
    return {
      error: NextResponse.json(
        {
          error:
            'Auth do servidor indisponível. Configure VITE_FIREBASE_API_KEY (ou FIREBASE_SERVICE_ACCOUNT_JSON) no Vercel.',
        },
        { status: 503 },
      ),
    }
  }

  try {
    const user = await verifyIdToken(match[1])
    if (!user?.uid) {
      return {
        error: NextResponse.json(
          { error: 'Token inválido ou expirado. Faça login novamente.' },
          { status: 401 },
        ),
      }
    }
    return { user }
  } catch (err) {
    console.error('[apiAuth] verify falhou:', err)
    return {
      error: NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 401 }),
    }
  }
}
