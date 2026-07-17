/**
 * Helpers Mercado Pago — retry com idempotency key estável e detecção de erros transitórios.
 */

const { retryWithBackoff, isTransientMercadoPagoError } = require('./httpUtils')

/**
 * Cria pagamento no MP com retry automático para falhas de rede/timeout.
 * @param {import('mercadopago').Payment} payment
 * @param {{ body: object, idempotencyKey: string, maxAttempts?: number }} opts
 */
async function createMercadoPagoPayment(payment, { body, idempotencyKey, maxAttempts = 3 }) {
  if (!idempotencyKey) {
    throw new Error('idempotencyKey é obrigatório para createMercadoPagoPayment')
  }

  return retryWithBackoff(
    () =>
      payment.create({
        body,
        requestOptions: { idempotencyKey },
      }),
    {
      maxAttempts,
      baseDelayMs: 800,
      shouldRetry: isTransientMercadoPagoError,
    },
  )
}

/** Retry genérico para chamadas SDK Mercado Pago (Preference, PreApproval, etc.). */
async function mercadoPagoSdkCall(fn, { maxAttempts = 3 } = {}) {
  return retryWithBackoff(fn, {
    maxAttempts,
    baseDelayMs: 800,
    shouldRetry: isTransientMercadoPagoError,
  })
}

/** Consulta pagamento no MP com retry (GET). */
async function getMercadoPagoPaymentWithRetry(payment, paymentId, { maxAttempts = 4 } = {}) {
  return retryWithBackoff(() => payment.get({ id: String(paymentId) }), {
    maxAttempts,
    baseDelayMs: 600,
    shouldRetry: isTransientMercadoPagoError,
  })
}

module.exports = {
  createMercadoPagoPayment,
  mercadoPagoSdkCall,
  getMercadoPagoPaymentWithRetry,
}
