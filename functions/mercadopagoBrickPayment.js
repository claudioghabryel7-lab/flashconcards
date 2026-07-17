/**
 * Lógica compartilhada do Checkout Transparente (Payment Brick).
 * Usada pelo HTTP processBrickPayment e pelo trigger Firestore (bypass de 429 no HTTPS).
 */

const admin = require('firebase-admin')
const { createMercadoPagoPayment } = require('./mercadopagoUtils')
const {
  createDedicatedPixPayment,
  createPaymentClient,
  isPixMethod,
  isEmvPixCode,
  persistPixOnTransaction,
  resolvePixFromPayment,
} = require('./pixPaymentService')

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

  const pixPayment = isPixMethod(formData)
  const accessToken = getMercadoPagoAccessToken({ forPix: pixPayment })
  if (!accessToken) {
    const err = new Error('Access token ausente.')
    err.statusCode = 500
    err.code = 'mp_not_configured'
    throw err
  }

  const payment = createPaymentClient(accessToken)

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

  const result = await createMercadoPagoPayment(payment, {
    body: paymentBody,
    idempotencyKey: `brick-${transactionId}`,
    maxAttempts: 3,
  })

  let {
    result: resolvedResult,
    pixCopyPaste,
    pixQrCode,
    ticketUrl,
  } = await resolvePixFromPayment(payment, result, { retries: 3 })

  if (pixPayment && !isEmvPixCode(pixCopyPaste)) {
    console.warn('processBrickPaymentPayload: PIX sem EMV — fallback dedicado', transactionId)
    try {
      const dedicated = await createDedicatedPixPayment(payment, {
        amount: amountNumber,
        description,
        transactionId,
        userEmail,
        userName,
        courseId,
      })
      if (isEmvPixCode(dedicated.pixCopyPaste)) {
        pixCopyPaste = dedicated.pixCopyPaste
        pixQrCode = dedicated.pixQrCode || pixQrCode
        ticketUrl = dedicated.ticketUrl || ticketUrl
        if (dedicated.paymentId) {
          resolvedResult = { ...resolvedResult, id: dedicated.paymentId, status: dedicated.status }
        }
      }
    } catch (fallbackErr) {
      console.error('processBrickPaymentPayload: fallback PIX falhou', fallbackErr?.message || fallbackErr)
    }
  }

  const status = resolvedResult.status || 'pending'
  const statusDetail = resolvedResult.status_detail || null

  try {
    await admin.firestore().collection('transactions').doc(String(transactionId)).set(
      {
        mercadopagoPaymentId: resolvedResult.id != null ? String(resolvedResult.id) : null,
        mercadopagoStatus: status,
        mercadopagoStatusDetail: statusDetail,
        paymentMethodId: resolvedResult.payment_method_id || paymentBody.payment_method_id || null,
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

  if (pixPayment && isEmvPixCode(pixCopyPaste)) {
    await persistPixOnTransaction(transactionId, {
      paymentId: resolvedResult.id,
      status,
      statusDetail,
      pixCopyPaste,
      pixQrCode,
      ticketUrl,
    })
  }

  if (pixPayment && !isEmvPixCode(pixCopyPaste)) {
    const err = new Error('Não foi possível gerar o código PIX. Tente novamente.')
    err.statusCode = 502
    err.code = 'pix_emv_missing'
    throw err
  }

  return {
    success: true,
    paymentId: resolvedResult.id,
    status,
    statusDetail,
    paymentMethodId: resolvedResult.payment_method_id || null,
    pixCopyPaste,
    pixQrCode,
    ticketUrl,
    testMode: isMercadoPagoTestMode(),
  }
}

module.exports = { processBrickPaymentPayload }
