/**
 * Serviço compartilhado PIX — criação, reconsulta e fallback.
 */

const admin = require('firebase-admin')
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { createMercadoPagoPayment } = require('./mercadopagoUtils')
const { extractPixFromMercadoPagoPayment, isEmvPixCode } = require('./pixExtract')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getWebhookUrl() {
  return (
    process.env.MERCADOPAGO_WEBHOOK_URL ||
    'https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago'
  )
}

function isPixMethod(paymentBody = {}) {
  const methodId = String(paymentBody.payment_method_id || '').toLowerCase()
  const typeId = String(paymentBody.payment_type_id || '').toLowerCase()
  return methodId === 'pix' || typeId === 'bank_transfer'
}

async function resolvePixFromPayment(payment, result, { retries = 3 } = {}) {
  let current = result
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const pix = extractPixFromMercadoPagoPayment(current)
    if (pix.pixCopyPaste || pix.pixQrCode) {
      return { result: current, ...pix }
    }
    if (!current?.id || attempt >= retries) break
    await sleep(1500)
    try {
      current = await payment.get({ id: current.id })
    } catch (err) {
      console.warn('resolvePixFromPayment:', err?.message || err)
      break
    }
  }
  return { result: current, ...extractPixFromMercadoPagoPayment(current) }
}

async function readCachedPixFromTransaction(transactionId) {
  if (!transactionId) return null
  try {
    const snap = await admin.firestore().collection('transactions').doc(String(transactionId)).get()
    if (!snap.exists) return null
    const data = snap.data() || {}
    if (!isEmvPixCode(data.pixCopyPaste)) return null
    return {
      paymentId: data.mercadopagoPaymentId || null,
      status: data.mercadopagoStatus || data.status || 'pending',
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

  const cached = await readCachedPixFromTransaction(transactionId)
  if (cached) return cached

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
    },
    notification_url: getWebhookUrl(),
  }

  const created = await createMercadoPagoPayment(payment, {
    body: paymentData,
    idempotencyKey: `pix-${transactionId}`,
    maxAttempts: 3,
  })

  const resolved = await resolvePixFromPayment(payment, created, { retries: 3 })
  const payload = {
    paymentId: resolved.result?.id,
    status: resolved.result?.status || 'pending',
    statusDetail: resolved.result?.status_detail || null,
    pixCopyPaste: resolved.pixCopyPaste,
    pixQrCode: resolved.pixQrCode,
    ticketUrl: resolved.ticketUrl,
  }

  await persistPixOnTransaction(transactionId, payload)
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
}
