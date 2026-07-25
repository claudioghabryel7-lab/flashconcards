/**
 * Autenticação de rotas API via Firebase ID token (Bearer).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getFirebaseAdminApp } from '@/lib/firebaseAdmin'

export type AuthUser = { uid: string; email?: string | null }

export async function requireApiAuth(
  request: NextRequest,
): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const header = request.headers.get('authorization') || request.headers.get('Authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) {
    return {
      error: NextResponse.json(
        { error: 'Não autenticado. Envie Authorization: Bearer <idToken>.' },
        { status: 401 },
      ),
    }
  }

  const app = getFirebaseAdminApp()
  if (!app) {
    return {
      error: NextResponse.json(
        {
          error:
            'Auth do servidor indisponível. Configure FIREBASE_SERVICE_ACCOUNT_JSON no ambiente.',
        },
        { status: 503 },
      ),
    }
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(match[1])
    return { user: { uid: decoded.uid, email: decoded.email || null } }
  } catch {
    return {
      error: NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 401 }),
    }
  }
}
