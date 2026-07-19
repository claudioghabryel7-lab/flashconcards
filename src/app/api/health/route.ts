import { createRequire } from 'module'

const require = createRequire(import.meta.url)

export async function GET() {
  require('../../../../server/api/initBackend.cjs')

  const started = Date.now()
  const checks: Record<string, string> = {
    firestore: 'unknown',
    auth: 'unknown',
  }

  try {
    const { getAdmin } = require('../../../../server/admin/initFirebaseAdmin.cjs')
    await getAdmin().firestore().collection('_health').doc('ping').get()
    checks.firestore = 'ok'
  } catch {
    checks.firestore = 'error'
  }

  try {
    const { getAdmin } = require('../../../../server/admin/initFirebaseAdmin.cjs')
    await getAdmin().auth().listUsers(1)
    checks.auth = 'ok'
  } catch {
    checks.auth = 'error'
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
      latencyMs: Date.now() - started,
      version: 'vercel',
      runtime: 'nextjs',
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  )
}
