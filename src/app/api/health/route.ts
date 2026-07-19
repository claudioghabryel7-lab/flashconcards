import { createRequire } from 'module'

const require = createRequire(import.meta.url)

export async function GET() {
  require('../../../../server/api/initBackend.cjs')

  const started = Date.now()
  const checks: Record<string, string> = {
    firestore: 'unknown',
    auth: 'unknown',
    firebaseAdmin: 'unknown',
  }

  try {
    const { getAdmin } = require('../../../../server/admin/initFirebaseAdmin.cjs')
    const admin = getAdmin()
    checks.firebaseAdmin = admin.apps.length ? 'ok' : 'app_not_initialized'
    await admin.firestore().collection('_health').doc('ping').get()
    checks.firestore = 'ok'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    checks.firestore = message.includes('does not exist')
      ? 'app_not_initialized'
      : /credential/i.test(message)
        ? 'missing_credentials'
        : 'error'
    if (checks.firebaseAdmin === 'unknown') {
      checks.firebaseAdmin = checks.firestore
    }
  }

  try {
    const { getAdmin } = require('../../../../server/admin/initFirebaseAdmin.cjs')
    await getAdmin().auth().listUsers(1)
    checks.auth = 'ok'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    checks.auth = message.includes('does not exist')
      ? 'app_not_initialized'
      : /credential/i.test(message)
        ? 'missing_credentials'
        : 'error'
  }

  checks.email =
    process.env.EMAIL_USER && process.env.EMAIL_PASSWORD ? 'configured' : 'missing'

  const { collectGeminiApiKeys } = require('../../../../src/utils/geminiKeyPool.js')
  checks.gemini = collectGeminiApiKeys().length > 0 ? 'configured' : 'missing'

  const mpToken =
    process.env.MERCADOPAGO_ACCESS_TOKEN_PROD || process.env.MERCADOPAGO_ACCESS_TOKEN || ''
  checks.mercadopago = mpToken ? 'configured' : 'missing'

  const healthy =
    checks.firestore === 'ok' && checks.auth === 'ok' && checks.gemini === 'configured'

  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks,
      hint:
        checks.firestore === 'missing_credentials' || checks.auth === 'missing_credentials'
          ? 'Rode `npx firebase login` ou configure FIREBASE_SERVICE_ACCOUNT_KEY / firebase-service-account.json.'
          : undefined,
      latencyMs: Date.now() - started,
      version: 'vercel',
      runtime: 'nextjs',
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  )
}
