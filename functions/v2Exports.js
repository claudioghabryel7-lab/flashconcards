/**
 * Cloud Functions 2ª geração (Cloud Run) — endpoints críticos e jobs de background.
 */

const { onRequest } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const admin = require('firebase-admin')
const { withCors } = require('./corsConfig')
const { handleCreatePixPayment } = require('./handlers/createPixPaymentHandler')
const { processBrickPaymentPayload } = require('./mercadopagoBrickPayment')

setGlobalOptions({
  region: 'us-central1',
  memory: '512MiB',
})

function getMercadoPagoAccessToken(options = {}) {
  const functions = require('firebase-functions')
  const { forPix = false } = options
  const mode = String(
    process.env.MERCADOPAGO_MODE || functions.config().mercadopago?.mode || 'test',
  ).toLowerCase()
  const cfgToken =
    functions.config().mercadopago?.access_token_prod ||
    functions.config().mercadopago?.access_token ||
    ''

  if (forPix) {
    return (
      process.env.MERCADOPAGO_ACCESS_TOKEN_PIX ||
      process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
      process.env.MERCADOPAGO_ACCESS_TOKEN ||
      cfgToken ||
      process.env.MERCADOPAGO_ACCESS_TOKEN_TEST ||
      ''
    )
  }

  if (mode === 'test' || mode === 'sandbox') {
    return process.env.MERCADOPAGO_ACCESS_TOKEN_TEST || process.env.MERCADOPAGO_ACCESS_TOKEN || ''
  }
  return (
    process.env.MERCADOPAGO_ACCESS_TOKEN_PROD ||
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    cfgToken ||
    ''
  )
}

/** Health check v2 — minInstances=0 (sem custo fixo; cold start ~2s na 1ª requisição). */
exports.healthCheckV2 = onRequest(
  {
    minInstances: 0,
    maxInstances: 3,
    timeoutSeconds: 10,
    memory: '128MiB',
    concurrency: 80,
  },
  async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    const started = Date.now()
    const checks = { firestore: 'unknown', auth: 'unknown' }

    try {
      await admin.firestore().collection('_health').doc('ping').get()
      checks.firestore = 'ok'
    } catch {
      checks.firestore = 'error'
    }

    try {
      await admin.auth().listUsers(1)
      checks.auth = 'ok'
    } catch {
      checks.auth = 'error'
    }

    const { getEmailCredentials, createEmailTransporter } = require('./emailUtils')
    const { pass } = getEmailCredentials()
    checks.email = pass && createEmailTransporter() ? 'configured' : 'missing'

    const healthy = checks.firestore === 'ok' && checks.auth === 'ok'
    const body = {
      status: healthy ? 'ok' : 'degraded',
      checks,
      latencyMs: Date.now() - started,
      version: 'v2',
      timestamp: new Date().toISOString(),
    }

    if (req.method === 'HEAD') return res.status(healthy ? 200 : 503).end()
    return res.status(healthy ? 200 : 503).json(body)
  },
)

/**
 * PIX v2 — minInstances=0 (sem custo fixo).
 * concurrency=40: múltiplas requisições PIX por instância (I/O bound).
 */
exports.createPixPaymentV2 = onRequest(
  {
    minInstances: 0,
    maxInstances: 10,
    timeoutSeconds: 30,
    memory: '256MiB',
    concurrency: 40,
    cors: false,
  },
  withCors((req, res) => handleCreatePixPayment(req, res, { getMercadoPagoAccessToken })),
)

/**
 * Payment Brick v2 — minInstances=0, retry no SDK via mercadopagoUtils.
 */
exports.processBrickPaymentV2 = onRequest(
  {
    minInstances: 0,
    maxInstances: 10,
    timeoutSeconds: 30,
    memory: '256MiB',
    concurrency: 40,
    cors: false,
  },
  withCors(async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }
    try {
      const result = await processBrickPaymentPayload(req.body || {}, {
        getMercadoPagoAccessToken,
        isMercadoPagoTestMode: () => {
          const mode = String(
            process.env.MERCADOPAGO_MODE ||
              require('firebase-functions').config().mercadopago?.mode ||
              'test',
          ).toLowerCase()
          if (mode === 'prod' || mode === 'production') return false
          if (mode === 'test' || mode === 'sandbox') return true
          const token = getMercadoPagoAccessToken()
          return String(token).startsWith('TEST-')
        },
      })
      return res.status(200).json(result)
    } catch (error) {
      console.error('Erro processBrickPaymentV2:', error)
      const status = error.statusCode || 500
      return res.status(status).json({
        error: status === 400 ? 'Dados inválidos' : 'Erro ao processar pagamento',
        message: error.message || error.cause?.[0]?.description || 'Erro desconhecido',
      })
    }
  }),
)

const {
  handleSendEmailVerificationCode,
  handleVerifyEmailCode,
} = require('./handlers/emailVerificationHandlers')

/** Verificação de email v2 — envio do código de 6 dígitos. */
exports.sendEmailVerificationCodeV2 = onRequest(
  {
    minInstances: 0,
    maxInstances: 5,
    timeoutSeconds: 30,
    memory: '256MiB',
    concurrency: 20,
    cors: false,
  },
  withCors(handleSendEmailVerificationCode),
)

/** Verificação de email v2 — validação do código. */
exports.verifyEmailCodeV2 = onRequest(
  {
    minInstances: 0,
    maxInstances: 5,
    timeoutSeconds: 30,
    memory: '256MiB',
    concurrency: 40,
    cors: false,
  },
  withCors(handleVerifyEmailCode),
)

/** Job de geração v2 — aguardando permissões Eventarc (desabilitado; v1 ativo). */
/*
exports.onGenerationJobCreatedV2 = onDocumentCreated(
  {
    document: 'users/{userId}/generationJobs/{jobId}',
    timeoutSeconds: 540,
    memory: '1GiB',
    concurrency: 1,
    minInstances: 0,
    maxInstances: 5,
  },
  async (event) => {
    const snap = event.data
    if (!snap) return null

    const data = snap.data() || {}
    if (!data.runOnServer || data.status !== 'pending') return null

    const userId = event.params.userId
    const jobId = event.params.jobId
    const { runServerGenerationJob } = getKickModule()
    const result = await runServerGenerationJob(userId, jobId, data)
    console.log(`[onGenerationJobCreatedV2] ${jobId}:`, result?.ok ? 'ok' : result?.reason || result)
    return null
  },
)
*/

/** Cron de retomada v2 — desabilitado; v1 resumeWaitingGenerationJobs ativo. */
/*
exports.resumeWaitingGenerationJobsV2 = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'America/Sao_Paulo',
    timeoutSeconds: 540,
    memory: '1GiB',
    concurrency: 1,
    minInstances: 0,
    maxInstances: 1,
  },
  async () => {
    const { processStuckPendingGenerationJobs } = getKickModule()
    const stuck = await processStuckPendingGenerationJobs()

    const { getResumeModule } = require('./generationLoader')
    const { resumeWaitingGenerationJobs } = getResumeModule()
    const result = await resumeWaitingGenerationJobs()

    if (stuck.kicked > 0 || result.resumed > 0 || result.waiting > 0 || result.stalled > 0) {
      console.log('[resumeWaitingGenerationJobsV2]', { stuck, ...result })
    }
    return null
  },
)
*/
