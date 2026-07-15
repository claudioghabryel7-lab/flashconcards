/**
 * Lógica compartilhada do Checkout Transparente (Payment Brick).
 * Usada pelo HTTP processBrickPayment e pelo trigger Firestore (bypass de 429 no HTTPS).
 */

const admin = require('firebase-admin')
const { MercadoPagoConfig, Payment } = require('mercadopago')

async function processBrickPaymentPayload(
  {
    transactionId,
    formData,
    amount,
    description,
    userEmail,
    userName,
    courseId,
  },
  {
    getMercadoPagoAccessToken,
    isMercadoPagoTestMode,
  },
) {
  const amountNumber = parseFloat(amount)
  if (!transactionId || !formData || Number.isNaN(amountNumber) || amountNumber <= 0) {
    const err = new Error('Informe transactionId, formData e amount válidos.')
    err.statusCode = 400
    err.code = 'invalid_payload'
    throw err
  }

  const accessToken = getMercadoPagoAccessToken({ forPix: true })
  if (!accessToken) {
    const err = new Error('Access token ausente.')
    err.statusCode = 500
    err.code = 'mp_not_configured'
    throw err
  }

  const client = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 20000 },
  })
  const payment = new Payment(client)

  const payerFromBrick = formData.payer || {}
  const paymentBody = {
    ...formData,
    transaction_amount: Number(amountNumber.toFixed(2)),
    description: String(description || 'Curso').slice(0, 255),
    external_reference: String(transactionId),
    metadata: {
      ...(formData.metadata || {}),
      transaction_id: String(transactionId),
      course_id: courseId || null,
    },
    notification_url:
      process.env.MERCADOPAGO_WEBHOOK_URL ||
      'https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago',
    payer: {
      ...payerFromBrick,
      email: payerFromBrick.email || userEmail || undefined,
      first_name:
        payerFromBrick.first_name ||
        (userName || 'Cliente').split(' ')[0] ||
        'Cliente',
    },
  }

  if (paymentBody.transaction_amount == null) {
    paymentBody.transaction_amount = Number(amountNumber.toFixed(2))
  }

  const rawInstallments = Number(paymentBody.installments)
  if (Number.isFinite(rawInstallments) && rawInstallments > 0) {
    paymentBody.installments = Math.min(6, Math.max(1, Math.floor(rawInstallments)))
  } else if (paymentBody.token) {
    paymentBody.installments = 1
  }

  console.log('processBrickPaymentPayload:', {
    transactionId,
    paymentMethodId: paymentBody.payment_method_id,
    installments: paymentBody.installments || null,
    tokenPrefix: String(accessToken).slice(0, 8),
  })

  const result = await payment.create({
    body: paymentBody,
    requestOptions: {
      idempotencyKey: `${transactionId}-${Date.now()}`,
    },
  })

  const status = result.status || 'pending'
  const statusDetail = result.status_detail || null
  const pointOfInteraction = result.point_of_interaction || {}
  const txData = pointOfInteraction.transaction_data || {}

  const pixCopyPaste = txData.qr_code || null
  const pixQrCode = txData.qr_code_base64 || null
  const ticketUrl = txData.ticket_url || result.transaction_details?.external_resource_url || null

  try {
    await admin.firestore().collection('transactions').doc(String(transactionId)).set(
      {
        mercadopagoPaymentId: result.id != null ? String(result.id) : null,
        mercadopagoStatus: status,
        mercadopagoStatusDetail: statusDetail,
        paymentMethodId: result.payment_method_id || paymentBody.payment_method_id || null,
        pixCopyPaste: pixCopyPaste || null,
        pixQrCode: pixQrCode || null,
        ticketUrl: ticketUrl || null,
        checkoutMode: 'transparent_brick',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(status === 'approved'
          ? { status: 'approved', paidAt: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
      },
      { merge: true },
    )
  } catch (txErr) {
    console.warn('processBrickPaymentPayload: falha ao atualizar transaction', txErr?.message || txErr)
  }

  return {
    success: true,
    paymentId: result.id,
    status,
    statusDetail,
    paymentMethodId: result.payment_method_id || null,
    pixCopyPaste,
    pixQrCode,
    ticketUrl,
    testMode: isMercadoPagoTestMode(),
  }
}

module.exports = { processBrickPaymentPayload }
