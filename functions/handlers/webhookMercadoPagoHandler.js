const admin = require('firebase-admin')
const { getMercadoPagoAccessToken } = require('../mercadopagoConfig')
const {
  fetchPaymentInfo,
  findTransactionByPaymentId,
  resolveTransactionDoc,
} = require('../pixReconciliation')
const { syncTransactionPaymentStatus } = require('../mercadopagoPaymentFulfillment')

const legacyFunctions = { config: () => ({}) }

async function handleWebhookMercadoPago(req, res) {
  try {
    const { type, data } = req.body || {}

    if (type !== 'payment' && type !== 'payment.updated') {
      return res.status(200).json({ received: true, message: 'Evento não processado' })
    }

    const paymentId = data?.id
    if (!paymentId) {
      return res.status(400).json({ error: 'Payment ID não encontrado' })
    }

    const paymentInfo = await fetchPaymentInfo(paymentId, getMercadoPagoAccessToken)

    let transactionDoc = await findTransactionByPaymentId(paymentId)
    if (!transactionDoc) {
      transactionDoc = await resolveTransactionDoc(paymentId, paymentInfo, getMercadoPagoAccessToken)
    }

    if (!transactionDoc) {
      return res.status(200).json({ received: true, message: 'Transação não encontrada' })
    }

    const transactionData = transactionDoc.data()
    const paymentStatus = paymentInfo?.status || data?.status || 'pending'

    const result = await syncTransactionPaymentStatus(admin, legacyFunctions, {
      transactionDoc,
      transactionData,
      paymentId,
      paymentStatus,
    })

    return res.status(200).json({
      received: true,
      transactionId: transactionDoc.id,
      status: result.newStatus,
    })
  } catch (error) {
    console.error('Erro ao processar webhook do Mercado Pago:', error)
    return res.status(503).json({ received: false, error: error.message })
  }
}

module.exports = { handleWebhookMercadoPago }
