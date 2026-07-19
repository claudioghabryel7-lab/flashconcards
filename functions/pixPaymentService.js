/**
 * Serviço compartilhado PIX — criação, reconsulta, cache com TTL e fallback.
 */

const admin = require('firebase-admin')
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { createMercadoPagoPayment, getMercadoPagoPaymentWithRetry } = require('./mercadopagoUtils')
const { extractPixFromMercadoPagoPayment, isEmvPixCode } = require('./pixExtract')

/** Revalidar cache antes de expirar o QR (MP costuma expirar em ~30 min). */
const PIX_CACHE_MAX_AGE_MS = 25 * 60 * 1000
const INVALID_CACHE_STATUSES = new Set([
  'cancelled',
  'rejected',
  'expired',
  'refunded',
  'charged_back',
])

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getWebhookUrl() {
  if (process.env.MERCADOPAGO_WEBHOOK_URL) return process.env.MERCADOPAGO_WEBHOOK_URL
  const base =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://www.flashconcards.com.br'
  return `${String(base).replace(/\/$/, '')}/api/backend/webhook-mercado-pago`
}

function isPixMethod(paymentBody = {}) {
  const methodId = String(paymentBody.payment_method_id || '').toLowerCase()
  const typeId = String(paymentBody.payment_type_id || '').toLowerCase()
  return methodId === 'pix' || typeId === 'bank_transfer'
}

function getTimestampMs(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  return null
}

function isPixCacheExpired(data = {}) {
  const generatedAt =
    getTimestampMs(data.pixGeneratedAt) ||
    getTimestampMs(data.updatedAt) ||
    getTimestampMs(data.createdAt)
  if (!generatedAt) return true
  return Date.now() - generatedAt > PIX_CACHE_MAX_AGE_MS
}

async function resolvePixFromPayment(payment, result, { retries = 6, delayMs = 2000 } = {}) {
  let current = result
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const pix = extractPixFromMercadoPagoPayment(current)
    if (pix.pixCopyPaste || pix.pixQrCode) {
      return { result: current, ...pix }
    }
    if (!current?.id || attempt >= retries) break
    await sleep(delayMs)
    try {
      current = await getMercadoPagoPaymentWithRetry(payment, current.id)
    } catch (err) {
      console.warn('resolvePixFromPayment:', err?.message || err)
      if (attempt >= retries) break
    }
  }
  return { result: current, ...extractPixFromMercadoPagoPayment(current) }
}

/**
 * Lê PIX em cache no Firestore. Invalida se expirado ou status terminal no MP.
 * @param {import('mercadopago').Payment|null} paymentClient
 */
async function readCachedPixFromTransaction(transactionId, paymentClient = null) {
  if (!transactionId) return null
  try {
    const snap = await admin.firestore().collection('transactions').doc(String(transactionId)).get()
    if (!snap.exists) return null
    const data = snap.data() || {}
    if (!isEmvPixCode(data.pixCopyPaste)) return null

    const localStatus = String(data.mercadopagoStatus || data.status || 'pending').toLowerCase()
    if (INVALID_CACHE_STATUSES.has(localStatus)) return null

    let mpStatus = localStatus
    const paymentId = data.mercadopagoPaymentId

    const cacheExpired = isPixCacheExpired(data)
    if (paymentClient && paymentId && cacheExpired) {
      try {
        const mpPayment = await getMercadoPagoPaymentWithRetry(paymentClient, paymentId)
        mpStatus = String(mpPayment?.status || localStatus).toLowerCase()

        if (INVALID_CACHE_STATUSES.has(mpStatus)) {
          console.log('readCachedPixFromTransaction: cache invalidado — status MP', mpStatus)
          return null
        }

        if (mpPayment?.date_of_expiration) {
          const expiresAt = new Date(mpPayment.date_of_expiration).getTime()
          if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
            console.log('readCachedPixFromTransaction: PIX expirado no MP')
            return null
          }
        }
      } catch (err) {
        console.warn('readCachedPixFromTransaction: falha revalidação MP', err?.message || err)
        if (cacheExpired) return null
      }
    } else if (cacheExpired) {
      return null
    }

    return {
      paymentId: paymentId || null,
      status: mpStatus,
      pixCopyPaste: data.pixCopyPaste,
      pixQrCode: data.pixQrCode || null,
      ticketUrl: data.ticketUrl || null,
      cached: true,
    }
  } catch (err) {
    console.warn('readCachedPixFromTransaction:', err?.message || err)
    return null
  }
}

async function persistPixOnTransaction(transactionId, payload) {
  if (!transactionId) return
  try {
    await admin
      .firestore()
      .collection('transactions')
      .doc(String(transactionId))
      .set(
        {
          mercadopagoPaymentId:
            payload.paymentId != null ? String(payload.paymentId) : null,
          mercadopagoStatus: payload.status || 'pending',
          mercadopagoStatusDetail: payload.statusDetail || null,
          paymentMethodId: 'pix',
          pixCopyPaste: payload.pixCopyPaste || null,
          pixQrCode: payload.pixQrCode || null,
          ticketUrl: payload.ticketUrl || null,
          pixGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
  } catch (err) {
    console.warn('persistPixOnTransaction:', err?.message || err)
  }
}

async function createDedicatedPixPayment(
  payment,
  { amount, description, transactionId, userEmail, userName, courseId },
) {
  const amountNumber = parseFloat(amount)
  if (Number.isNaN(amountNumber) || amountNumber <= 0) {
    throw new Error('Valor PIX inválido.')
  }

  const cached = await readCachedPixFromTransaction(transactionId, payment)
  if (cached) return cached

  const txSnap = await admin.firestore().collection('transactions').doc(String(transactionId)).get()
  const pixAttempt = (txSnap.exists ? Number(txSnap.data()?.pixAttempt || 0) : 0) + 1

  const paymentData = {
    transaction_amount: Number(amountNumber.toFixed(2)),
    description: String(description || 'Curso').slice(0, 255),
    payment_method_id: 'pix',
    external_reference: String(transactionId),
    payer: {
      email: userEmail || 'cliente@exemplo.com',
      first_name: (userName || 'Cliente').split(' ')[0] || 'Cliente',
    },
    metadata: {
      transaction_id: String(transactionId),
      course_id: courseId || null,
      pix_attempt: pixAttempt,
    },
    notification_url: getWebhookUrl(),
  }

  const idempotencyKey =
    pixAttempt <= 1 ? `pix-${transactionId}` : `pix-${transactionId}-${pixAttempt}`

  const created = await createMercadoPagoPayment(payment, {
    body: paymentData,
    idempotencyKey,
    maxAttempts: 4,
  })

  const resolved = await resolvePixFromPayment(payment, created, { retries: 6, delayMs: 2000 })
  const payload = {
    paymentId: resolved.result?.id,
    status: resolved.result?.status || 'pending',
    statusDetail: resolved.result?.status_detail || null,
    pixCopyPaste: resolved.pixCopyPaste,
    pixQrCode: resolved.pixQrCode,
    ticketUrl: resolved.ticketUrl,
  }

  await persistPixOnTransaction(transactionId, payload)
  await admin
    .firestore()
    .collection('transactions')
    .doc(String(transactionId))
    .set({ pixAttempt }, { merge: true })

  return payload
}

function createPaymentClient(accessToken) {
  const client = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 25000 },
  })
  return new Payment(client)
}

module.exports = {
  sleep,
  isPixMethod,
  isEmvPixCode,
  resolvePixFromPayment,
  readCachedPixFromTransaction,
  createDedicatedPixPayment,
  createPaymentClient,
  persistPixOnTransaction,
  PIX_CACHE_MAX_AGE_MS,
}
